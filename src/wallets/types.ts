export interface ConnectResult {
  address: string
}

export interface SignTransactionOpts {
  networkPassphrase: string
  address?: string
}

export interface SignAuthEntryOpts {
  networkPassphrase: string
  address?: string
}

export interface WalletAdapter {
  readonly name: string
  readonly installUrl: string

  isAvailable(): boolean | Promise<boolean>
  connect(): Promise<ConnectResult>
  disconnect(): Promise<void>
  getAddress(): Promise<string>
  getNetworkPassphrase(): Promise<string>
  signTransaction(xdr: string, opts: SignTransactionOpts): Promise<string>
  signAuthEntry(entryXdr: string, opts: SignAuthEntryOpts): Promise<string>
}
