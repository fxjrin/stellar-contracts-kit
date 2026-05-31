import { getPublicKey, signTransaction as lobstrSignTx, isConnected } from '@lobstrco/signer-extension-api'
import { makeError } from '../errors/index.js'
import type { WalletAdapter, ConnectResult, SignTransactionOpts, SignAuthEntryOpts } from './types.js'

export class LobstrAdapter implements WalletAdapter {
  readonly name = 'Lobstr'
  readonly installUrl = 'https://lobstr.co/'

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false
    if ((window as unknown as Record<string, unknown>).lobstrSignerExtension) return true
    return Promise.race([
      isConnected() as Promise<boolean>,
      new Promise<boolean>(res => setTimeout(() => res(false), 500)),
    ])
  }

  async connect(): Promise<ConnectResult> {
    try {
      const address = await getPublicKey()
      return { address }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('cancel')) {
        throw makeError('WALLET_REJECTED', 'Lobstr connection was rejected by the user')
      }
      throw makeError('WALLET_REJECTED', `Lobstr connection failed: ${msg}`, err)
    }
  }

  async disconnect(): Promise<void> {
    // Lobstr does not expose a programmatic disconnect
  }

  async getAddress(): Promise<string> {
    try {
      return await getPublicKey()
    } catch (err) {
      throw makeError('WALLET_NOT_CONNECTED', 'Could not retrieve Lobstr public key. Make sure the wallet is connected.', err)
    }
  }

  async getNetworkPassphrase(): Promise<string> {
    // Lobstr does not expose network info. The kit config is authoritative.
    throw makeError(
      'RPC_ERROR',
      'Lobstr does not expose network info. Ensure your Lobstr extension is set to the same network as your kit config.',
    )
  }

  async signTransaction(xdr: string, _opts: SignTransactionOpts): Promise<string> {
    try {
      return await lobstrSignTx(xdr)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('cancel')) {
        throw makeError('WALLET_REJECTED', 'Lobstr rejected transaction signing')
      }
      throw makeError('WALLET_REJECTED', `Lobstr signing failed: ${msg}`, err)
    }
  }

  async signAuthEntry(_entryXdr: string, _opts: SignAuthEntryOpts): Promise<string> {
    throw makeError(
      'WALLET_REJECTED',
      'Lobstr does not support signing individual auth entries. For multi-party auth contracts, use Freighter.',
    )
  }
}
