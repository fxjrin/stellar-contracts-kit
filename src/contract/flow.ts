import {
  TransactionBuilder,
  Contract,
  BASE_FEE,
  type Transaction,
  xdr,
  rpc,
} from '@stellar/stellar-sdk'
import { makeError, isContractKitError } from '../errors/index.js'
import type { NetworkConfig } from '../network/config.js'
import type { WalletAdapter } from '../wallets/types.js'

const TX_TIMEOUT_SECONDS = 300

export interface SimulateResult {
  retval: xdr.ScVal
  requiresAuth: boolean
}

/** Internal: carries raw simulation data so auto() can pass it into invoke without re-simulating. */
export interface SimulateData {
  result: SimulateResult
  tx: Transaction
  rawSim: rpc.Api.SimulateTransactionSuccessResponse
}

export interface InvokeResult {
  txHash: string
  retval: xdr.ScVal | undefined
}

function decodeSubmissionError(errorResult?: xdr.TransactionResult): string {
  if (!errorResult) return 'unknown submission error'
  try {
    return errorResult.result().switch().name
  } catch {
    return 'unknown submission error'
  }
}

function decodePollingError(pollRes: rpc.Api.GetTransactionResponse): string {
  if (pollRes.status !== rpc.Api.GetTransactionStatus.FAILED) return 'unknown'
  try {
    const resultXdr = (pollRes as { resultXdr?: xdr.TransactionResult }).resultXdr
    if (!resultXdr) return 'transaction failed'
    const innerResults = resultXdr.result().results?.()
    const opCode = innerResults?.[0]?.tr().invokeHostFunctionResult?.().switch().name
    return opCode ?? resultXdr.result().switch().name
  } catch {
    return 'transaction failed on-chain'
  }
}

async function checkNetworkMatch(wallet: WalletAdapter, network: NetworkConfig): Promise<void> {
  try {
    const walletPassphrase = await wallet.getNetworkPassphrase()
    if (walletPassphrase !== network.networkPassphrase) {
      throw makeError(
        'WALLET_NETWORK_MISMATCH',
        `Wallet network mismatch. Wallet is on "${walletPassphrase}", kit is on "${network.networkPassphrase}". Switch your wallet to the correct network.`,
      )
    }
  } catch (err) {
    // Only surface a real network mismatch. Wallets that do not expose network info are skipped.
    if (isContractKitError(err) && err.code === 'WALLET_NETWORK_MISMATCH') throw err
  }
}

async function buildTx(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  callerAddress: string,
  server: rpc.Server,
  network: NetworkConfig,
): Promise<Transaction> {
  const account = await server.getAccount(callerAddress)
  const contract = new Contract(contractId)

  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build()
}

async function finalizeTx(txHash: string, server: rpc.Server): Promise<InvokeResult> {
  const pollRes = await server.pollTransaction(txHash, {
    attempts: 20,
    sleepStrategy: rpc.LinearSleepStrategy,
  })

  if (pollRes.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw makeError('TX_FAILED', `Transaction failed on-chain: ${decodePollingError(pollRes)}`)
  }

  if (pollRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw makeError('TX_TIMEOUT', `Transaction not confirmed after polling. Hash: ${txHash}`)
  }

  return { txHash, retval: pollRes.returnValue }
}

async function submitTx(
  simData: SimulateData,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  callerAddress: string,
  wallet: WalletAdapter,
  server: rpc.Server,
  network: NetworkConfig,
): Promise<InvokeResult> {
  const { tx, rawSim } = simData
  const assembled = rpc.assembleTransaction(tx, rawSim).build()

  const signedXdr = await wallet.signTransaction(assembled.toXDR(), {
    networkPassphrase: network.networkPassphrase,
    address: callerAddress,
  })

  const freshAccount = await server.getAccount(callerAddress)
  const refreshedTx = TransactionBuilder.fromXDR(signedXdr, network.networkPassphrase) as Transaction
  const expectedSeq = (BigInt(freshAccount.sequenceNumber()) + 1n).toString()

  if (refreshedTx.sequence !== expectedSeq) {
    // Sequence drifted while user was approving in wallet. Rebuild and resign.
    const retryData = await runSimulate(contractId, method, args, callerAddress, server, network)
    const retryAssembled = rpc.assembleTransaction(retryData.tx, retryData.rawSim).build()
    const retrySignedXdr = await wallet.signTransaction(retryAssembled.toXDR(), {
      networkPassphrase: network.networkPassphrase,
      address: callerAddress,
    })
    const retryTx = TransactionBuilder.fromXDR(retrySignedXdr, network.networkPassphrase) as Transaction
    const sendRetry = await server.sendTransaction(retryTx)
    if (sendRetry.status === 'ERROR') {
      throw makeError('TX_SUBMISSION_FAILED', `Transaction failed after retry: ${decodeSubmissionError(sendRetry.errorResult)}`)
    }
    return finalizeTx(sendRetry.hash, server)
  }

  const sendRes = await server.sendTransaction(refreshedTx)
  if (sendRes.status === 'ERROR') {
    throw makeError('TX_SUBMISSION_FAILED', `Transaction failed: ${decodeSubmissionError(sendRes.errorResult)}`)
  }

  return finalizeTx(sendRes.hash, server)
}

async function runSimulate(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  callerAddress: string,
  server: rpc.Server,
  network: NetworkConfig,
): Promise<SimulateData> {
  const tx = await buildTx(contractId, method, args, callerAddress, server, network)
  const sim = await server.simulateTransaction(tx)

  if (rpc.Api.isSimulationError(sim)) {
    throw makeError('CONTRACT_SIMULATION_FAILED', `Simulation failed: ${sim.error}`)
  }

  if (rpc.Api.isSimulationRestore(sim)) {
    throw makeError(
      'CONTRACT_RESTORE_REQUIRED',
      'Contract state has expired and needs to be restored. Call kit.restoreContract(contractId) first.',
    )
  }

  const retval = sim.result?.retval ?? xdr.ScVal.scvVoid()
  const requiresAuth = (sim.result?.auth?.length ?? 0) > 0

  return {
    result: { retval, requiresAuth },
    tx,
    rawSim: sim as rpc.Api.SimulateTransactionSuccessResponse,
  }
}

export async function simulateContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  callerAddress: string,
  server: rpc.Server,
  network: NetworkConfig,
): Promise<SimulateResult> {
  const { result } = await runSimulate(contractId, method, args, callerAddress, server, network)
  return result
}

/** Like simulateContract but returns the full simulation data for reuse in invokeContract to avoid a second RPC call. */
export async function simulateContractFull(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  callerAddress: string,
  server: rpc.Server,
  network: NetworkConfig,
): Promise<SimulateData> {
  return runSimulate(contractId, method, args, callerAddress, server, network)
}

export async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  wallet: WalletAdapter,
  server: rpc.Server,
  network: NetworkConfig,
  /** Pass a pre-computed SimulateData from simulateContractFull to skip re-simulation. */
  preSim?: SimulateData,
): Promise<InvokeResult> {
  const callerAddress = await wallet.getAddress()
  await checkNetworkMatch(wallet, network)

  const simData = preSim ?? await runSimulate(contractId, method, args, callerAddress, server, network)
  return submitTx(simData, contractId, method, args, callerAddress, wallet, server, network)
}
