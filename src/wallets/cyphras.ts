import { cyphras, isExtensionInstalled } from '@cyphras/sdk'
import type { CyphrasError } from '@cyphras/sdk'
import { makeError } from '../errors/index.js'
import type { WalletAdapter, ConnectResult, SignTransactionOpts, SignAuthEntryOpts } from './types.js'

function toKitError(err: CyphrasError): never {
  const c = err.code
  const m = err.message
  if (c === 'REJECTED' || c === 'USER_REJECTED') throw makeError('WALLET_REJECTED', m)
  if (c === 'TIMEOUT') throw makeError('TX_TIMEOUT', m)
  if (c === 'NETWORK_MISMATCH') throw makeError('WALLET_NETWORK_MISMATCH', m)
  if (c === 'UNAUTHORIZED' || c === 'NOT_ALLOWED' || c === 'NOT_CONNECTED' || c === 'WALLET_LOCKED') {
    throw makeError('WALLET_NOT_CONNECTED', m)
  }
  throw makeError('RPC_ERROR', m)
}

export class CyphrasAdapter implements WalletAdapter {
  readonly name = 'Cyphras'
  readonly installUrl = 'https://cyphras.com'

  isAvailable(): boolean {
    return isExtensionInstalled()
  }

  async connect(): Promise<ConnectResult> {
    if (!isExtensionInstalled()) throw makeError('WALLET_NOT_FOUND', 'Cyphras extension is not installed')
    const res = await cyphras.stellar.connect()
    if (res.error) toKitError(res.error)
    return { address: res.address }
  }

  async disconnect(): Promise<void> {
    if (!isExtensionInstalled()) return
    await cyphras.stellar.disconnect()
  }

  async getAddress(): Promise<string> {
    const res = await cyphras.stellar.getAccount()
    if (res.error) toKitError(res.error)
    return res.address
  }

  async getNetworkPassphrase(): Promise<string> {
    const res = await cyphras.stellar.getNetwork()
    if (res.error) toKitError(res.error)
    return res.networkPassphrase
  }

  async signTransaction(xdr: string, _opts: SignTransactionOpts): Promise<string> {
    const res = await cyphras.stellar.sign(xdr)
    if (res.error) toKitError(res.error)
    return res.signedTxXdr
  }

  async signAuthEntry(entryXdr: string, opts: SignAuthEntryOpts): Promise<string> {
    const res = await cyphras.stellar.sign(entryXdr, {
      type: 'authEntry',
      networkPassphrase: opts.networkPassphrase,
    })
    if (res.error) toKitError(res.error)
    return res.signedAuthEntry
  }
}
