import freighter from '@stellar/freighter-api'
import { makeError } from '../errors/index.js'
import type { WalletAdapter, ConnectResult, SignTransactionOpts, SignAuthEntryOpts } from './types.js'

export class FreighterAdapter implements WalletAdapter {
  readonly name = 'Freighter'
  readonly installUrl = 'https://freighter.app'

  async isAvailable(): Promise<boolean> {
    const res = await freighter.isConnected()
    return !res.error && res.isConnected === true
  }

  async connect(): Promise<ConnectResult> {
    const res = await freighter.requestAccess()
    if (res.error) {
      throw makeError('WALLET_REJECTED', res.error.message ?? 'Freighter access denied')
    }
    return { address: res.address }
  }

  async disconnect(): Promise<void> {
    // Freighter does not expose a disconnect method
  }

  async getAddress(): Promise<string> {
    const res = await freighter.getAddress()
    if (res.error) {
      throw makeError('WALLET_NOT_CONNECTED', res.error.message ?? 'Could not get Freighter address')
    }
    return res.address
  }

  async getNetworkPassphrase(): Promise<string> {
    const res = await freighter.getNetwork()
    if (res.error) {
      throw makeError('RPC_ERROR', res.error.message ?? 'Could not get Freighter network')
    }
    return res.networkPassphrase
  }

  async signTransaction(xdr: string, opts: SignTransactionOpts): Promise<string> {
    const signOpts: { networkPassphrase?: string; address?: string } = {
      networkPassphrase: opts.networkPassphrase,
    }
    if (opts.address !== undefined) signOpts.address = opts.address

    const res = await freighter.signTransaction(xdr, signOpts)
    if (res.error) {
      throw makeError('WALLET_REJECTED', res.error.message ?? 'Freighter rejected transaction signing')
    }
    return res.signedTxXdr
  }

  async signAuthEntry(entryXdr: string, opts: SignAuthEntryOpts): Promise<string> {
    const signOpts: { networkPassphrase?: string; address?: string } = {
      networkPassphrase: opts.networkPassphrase,
    }
    if (opts.address !== undefined) signOpts.address = opts.address

    const res = await freighter.signAuthEntry(entryXdr, signOpts)
    if (res.error) {
      throw makeError('WALLET_REJECTED', res.error.message ?? 'Freighter rejected auth entry signing')
    }
    if (!res.signedAuthEntry) {
      throw makeError('WALLET_REJECTED', 'Freighter returned null auth entry')
    }
    return res.signedAuthEntry
  }
}
