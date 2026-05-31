import type { WalletAdapter, ConnectResult } from './wallets/types.js'
import type { NetworkPreset, NetworkConfig } from './network/config.js'
import { resolveNetwork } from './network/config.js'
import { createServer } from './rpc/soroban.js'
import { fetchContractSpec } from './contract/spec.js'
import { buildContractClient, type ContractClient, type ContractMethodFn } from './contract/client.js'
import { restoreContract as doRestoreContract } from './contract/restore.js'
import { WalletPickerModal } from './wallets/modal.js'
import type { contract, rpc } from '@stellar/stellar-sdk'
import { makeError } from './errors/index.js'

export interface StellarContractsKitOptions {
  network: NetworkPreset | NetworkConfig
  /** If omitted, connect() opens the built-in picker modal. */
  wallet?: WalletAdapter
}

export class StellarContractsKit {
  private readonly network: NetworkConfig
  private readonly server: rpc.Server
  private wallet: WalletAdapter | null
  private readonly specCache = new Map<string, contract.Spec>()

  constructor(options: StellarContractsKitOptions) {
    this.network = resolveNetwork(options.network)
    this.server = createServer(this.network)
    this.wallet = options.wallet ?? null
  }

  setWallet(wallet: WalletAdapter): void {
    this.wallet = wallet
  }

  /** Returns the active wallet adapter, or null if none is set. */
  getWallet(): WalletAdapter | null {
    return this.wallet
  }

  /** Connects to the configured wallet, or opens the built-in picker modal if none is set. */
  async connect(): Promise<ConnectResult> {
    if (this.wallet) {
      return this.wallet.connect()
    }

    const modal = new WalletPickerModal()
    const { adapter, address } = await modal.pick()
    this.wallet = adapter
    return { address }
  }

  /** Disconnects the current wallet and clears the active adapter. */
  async disconnect(): Promise<void> {
    await this.wallet?.disconnect()
    this.wallet = null
  }

  isConnected(): boolean {
    return this.wallet !== null
  }

  /** Returns the address of the connected wallet. Throws WALLET_NOT_CONNECTED if no wallet is set. */
  async getAddress(): Promise<string> {
    if (!this.wallet) throw makeError('WALLET_NOT_CONNECTED', 'No wallet connected. Call connect() first.')
    return this.wallet.getAddress()
  }

  getNetwork(): NetworkConfig {
    return this.network
  }

  /**
   * Loads a typed contract client. Pass a generated interface as the type param for full autocomplete.
   * No wallet required for read/simulate calls. A wallet is required before calling invoke.
   * The spec is fetched once and cached; subsequent calls with the same ID are instant.
   */
  async contract<T extends { [K in keyof T]: ContractMethodFn<any, any[]> } = ContractClient>(contractId: string): Promise<T> {
    let spec = this.specCache.get(contractId)
    if (!spec) {
      spec = await fetchContractSpec(contractId, this.server, this.network)
      this.specCache.set(contractId, spec)
    }
    return buildContractClient(contractId, spec, this.wallet, this.server, this.network) as T
  }

  /**
   * Restores an expired contract's on-chain state.
   * Call this when contract() or invoke() throws CONTRACT_RESTORE_REQUIRED.
   */
  async restoreContract(contractId: string): Promise<{ txHash: string }> {
    if (!this.wallet) throw makeError('WALLET_NOT_CONNECTED', 'A wallet is required to restore a contract.')
    const result = await doRestoreContract(contractId, this.wallet, this.server, this.network)
    this.clearSpecCache(contractId)
    return result
  }

  /** Clears the cached contract spec. Pass a contractId to clear one, or omit to clear all. */
  clearSpecCache(contractId?: string): void {
    if (contractId) {
      this.specCache.delete(contractId)
    } else {
      this.specCache.clear()
    }
  }
}
