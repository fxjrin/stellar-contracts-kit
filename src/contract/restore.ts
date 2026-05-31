import {
  TransactionBuilder,
  Contract,
  Operation,
  SorobanDataBuilder,
  BASE_FEE,
  type Transaction,
  rpc,
} from '@stellar/stellar-sdk'
import { makeError } from '../errors/index.js'
import type { NetworkConfig } from '../network/config.js'
import type { WalletAdapter } from '../wallets/types.js'

const TX_TIMEOUT_SECONDS = 300

export async function restoreContract(
  contractId: string,
  wallet: WalletAdapter,
  server: rpc.Server,
  network: NetworkConfig,
): Promise<{ txHash: string }> {
  const callerAddress = await wallet.getAddress()
  const account = await server.getAccount(callerAddress)

  const contractObj = new Contract(contractId)
  const sorobanData = new SorobanDataBuilder()
    .setReadWrite([contractObj.getFootprint()])
    .build()

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(Operation.restoreFootprint({}))
    .setSorobanData(sorobanData)
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build()

  const sim = await server.simulateTransaction(tx)

  if (rpc.Api.isSimulationError(sim)) {
    throw makeError('TX_SUBMISSION_FAILED', `Restore simulation failed: ${sim.error}`)
  }

  const assembled = rpc.assembleTransaction(tx, sim).build()

  const signedXdr = await wallet.signTransaction(assembled.toXDR(), {
    networkPassphrase: network.networkPassphrase,
    address: callerAddress,
  })

  const signedTx = TransactionBuilder.fromXDR(signedXdr, network.networkPassphrase) as Transaction
  const sendRes = await server.sendTransaction(signedTx)

  if (sendRes.status === 'ERROR') {
    throw makeError('TX_SUBMISSION_FAILED', 'Restore transaction submission failed')
  }

  const pollRes = await server.pollTransaction(sendRes.hash, {
    attempts: 20,
    sleepStrategy: rpc.LinearSleepStrategy,
  })

  if (pollRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw makeError('TX_FAILED', `Restore transaction failed on-chain. Hash: ${sendRes.hash}`)
  }

  return { txHash: sendRes.hash }
}
