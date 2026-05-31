import { rpc } from '@stellar/stellar-sdk'
import type { NetworkConfig } from '../network/config.js'

export function createServer(network: NetworkConfig): rpc.Server {
  return new rpc.Server(network.rpcUrl, { allowHttp: network.rpcUrl.startsWith('http://') })
}
