import type { contract, rpc, xdr } from '@stellar/stellar-sdk'
import { makeError } from '../errors/index.js'
import type { NetworkConfig } from '../network/config.js'
import type { WalletAdapter } from '../wallets/types.js'
import { simulateContract, simulateContractFull, invokeContract } from './flow.js'

export interface ReadResult<T = unknown> {
  result: T
}

export interface WriteResult<T = unknown> {
  txHash: string
  result: T | undefined
}

/** A single contract method with auto/read/invoke call modes. Use ContractMethodFn<ReturnType, [arg: Type, ...]> to type each method. */
export type ContractMethodFn<TReturn = unknown, TArgs extends unknown[] = unknown[]> = {
  (...args: TArgs): Promise<WriteResult<TReturn> | ReadResult<TReturn>>
  read(...args: TArgs): Promise<ReadResult<TReturn>>
  simulate(...args: TArgs): Promise<ReadResult<TReturn>>
  invoke(...args: TArgs): Promise<WriteResult<TReturn>>
}

export type ContractClient = Record<string, ContractMethodFn>

const NULL_ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

function positionedArgs(spec: contract.Spec, methodName: string, args: unknown[]): Record<string, unknown> {
  const fn = spec.getFunc(methodName)
  const inputs = fn.inputs()

  if (args.length !== inputs.length) {
    throw makeError(
      'INVALID_PARAMS',
      `${methodName}() expects ${inputs.length} argument(s), received ${args.length}.`,
    )
  }

  const named: Record<string, unknown> = {}
  inputs.forEach((input, i) => {
    named[input.name().toString()] = args[i] ?? null
  })
  return named
}

function decodeRetval(spec: contract.Spec, methodName: string, retval: xdr.ScVal): unknown {
  try {
    return spec.funcResToNative(methodName, retval)
  } catch {
    return retval
  }
}

export function buildContractClient(
  contractId: string,
  spec: contract.Spec,
  wallet: WalletAdapter | null,
  server: rpc.Server,
  network: NetworkConfig,
): ContractClient {
  const client: ContractClient = {}

  for (const fn of spec.funcs()) {
    const methodName: string = fn.name().toString()

    const read = async (...args: unknown[]): Promise<ReadResult> => {
      const callerAddress = wallet ? await wallet.getAddress() : NULL_ACCOUNT
      const named = positionedArgs(spec, methodName, args)
      const scArgs = spec.funcArgsToScVals(methodName, named)
      const sim = await simulateContract(contractId, methodName, scArgs, callerAddress, server, network)
      return { result: decodeRetval(spec, methodName, sim.retval) }
    }

    const invoke = async (...args: unknown[]): Promise<WriteResult> => {
      if (!wallet) throw makeError('WALLET_NOT_CONNECTED', 'A wallet is required to invoke contract methods.')
      const named = positionedArgs(spec, methodName, args)
      const scArgs = spec.funcArgsToScVals(methodName, named)
      const res = await invokeContract(contractId, methodName, scArgs, wallet, server, network)
      return { txHash: res.txHash, result: res.retval ? decodeRetval(spec, methodName, res.retval) : undefined }
    }

    const auto = async (...args: unknown[]): Promise<ReadResult | WriteResult> => {
      const named = positionedArgs(spec, methodName, args)
      const scArgs = spec.funcArgsToScVals(methodName, named)
      const callerAddress = wallet ? await wallet.getAddress() : NULL_ACCOUNT

      // Simulate once and reuse result if invoking, so there is no double RPC call.
      const simData = await simulateContractFull(contractId, methodName, scArgs, callerAddress, server, network)

      if (!simData.result.requiresAuth) {
        return { result: decodeRetval(spec, methodName, simData.result.retval) }
      }

      if (!wallet) throw makeError('WALLET_NOT_CONNECTED', 'A wallet is required to invoke this contract method.')

      const res = await invokeContract(contractId, methodName, scArgs, wallet, server, network, simData)
      return { txHash: res.txHash, result: res.retval ? decodeRetval(spec, methodName, res.retval) : undefined }
    }

    client[methodName] = Object.assign(auto, { simulate: read, read, invoke }) as ContractMethodFn
  }

  return client
}
