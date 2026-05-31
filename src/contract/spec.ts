import { contract, rpc } from '@stellar/stellar-sdk'
import type { NetworkConfig } from '../network/config.js'
import { makeError } from '../errors/index.js'

function validateContractId(id: string): void {
  if (!/^C[A-Z2-7]{55}$/.test(id)) {
    throw makeError(
      'INVALID_CONTRACT_ID',
      `"${id}" is not a valid Soroban contract address. Expected a 56-character string starting with C (e.g. CABC...).`,
    )
  }
}

export async function fetchContractSpec(
  contractId: string,
  server: rpc.Server,
  network: NetworkConfig,
): Promise<contract.Spec> {
  validateContractId(contractId)

  let wasm: Buffer
  try {
    wasm = await server.getContractWasmByContractId(contractId)
  } catch (err) {
    throw makeError('CONTRACT_NOT_FOUND', `Contract ${contractId} not found or has no WASM`, err)
  }

  try {
    // Uses stellar-sdk's built-in WASM parser, which is browser-safe without Buffer polyfills.
    const client = await contract.Client.fromWasm(wasm, {
      contractId,
      networkPassphrase: network.networkPassphrase,
      rpcUrl: network.rpcUrl,
    })
    return client.spec
  } catch (err) {
    throw makeError('CONTRACT_SPEC_ERROR', `Failed to parse contract spec for ${contractId}`, err)
  }
}
