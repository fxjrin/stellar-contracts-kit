import { describe, it, expect } from 'vitest'
import { StellarContractsKit } from '../src/kit.js'
import { FreighterAdapter } from '../src/wallets/freighter.js'
import { LobstrAdapter } from '../src/wallets/lobstr.js'
import { isContractKitError } from '../src/errors/index.js'
import { NETWORKS } from '../src/network/config.js'

describe('StellarContractsKit - constructor and network', () => {
  it('resolves a testnet preset correctly', () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    expect(kit.getNetwork()).toEqual(NETWORKS.testnet)
  })

  it('resolves a mainnet preset correctly', () => {
    const kit = new StellarContractsKit({ network: 'mainnet' })
    expect(kit.getNetwork().networkPassphrase).toBe('Public Global Stellar Network ; September 2015')
  })

  it('accepts a custom NetworkConfig', () => {
    const custom = {
      rpcUrl: 'https://custom-rpc.example.com',
      networkPassphrase: 'Custom Network',
      horizonUrl: 'https://custom-horizon.example.com',
    }
    const kit = new StellarContractsKit({ network: custom })
    expect(kit.getNetwork()).toEqual(custom)
  })
})

describe('StellarContractsKit - wallet state', () => {
  it('isConnected returns false with no wallet', () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    expect(kit.isConnected()).toBe(false)
  })

  it('getWallet returns null with no wallet', () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    expect(kit.getWallet()).toBeNull()
  })

  it('getAddress throws WALLET_NOT_CONNECTED when no wallet is set', async () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    await expect(kit.getAddress()).rejects.toMatchObject({ code: 'WALLET_NOT_CONNECTED' })
  })

  it('restoreContract throws WALLET_NOT_CONNECTED when no wallet is set', async () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    await expect(
      kit.restoreContract('CCFOVCOSNZBOGAQLVQKYFBI5WZ26EINXUHH2DW4J4F3G2MPSPBU3DVO5'),
    ).rejects.toMatchObject({ code: 'WALLET_NOT_CONNECTED' })
  })

  it('setWallet stores the adapter and isConnected returns true', () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    const adapter = new LobstrAdapter()
    kit.setWallet(adapter)
    expect(kit.isConnected()).toBe(true)
    expect(kit.getWallet()).toBe(adapter)
  })

  it('disconnect clears the wallet', async () => {
    const adapter = new LobstrAdapter()
    const kit = new StellarContractsKit({ network: 'testnet', wallet: adapter })
    expect(kit.isConnected()).toBe(true)
    await kit.disconnect()
    expect(kit.isConnected()).toBe(false)
    expect(kit.getWallet()).toBeNull()
  })
})

describe('StellarContractsKit - contract() validation', () => {
  it('throws INVALID_CONTRACT_ID for a short string', async () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    await expect(kit.contract('CABC')).rejects.toMatchObject({ code: 'INVALID_CONTRACT_ID' })
  })

  it('throws INVALID_CONTRACT_ID for an address starting with G', async () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    await expect(
      kit.contract('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
    ).rejects.toMatchObject({ code: 'INVALID_CONTRACT_ID' })
  })

  it('throws INVALID_CONTRACT_ID for an empty string', async () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    await expect(kit.contract('')).rejects.toMatchObject({ code: 'INVALID_CONTRACT_ID' })
  })

  it('throws INVALID_CONTRACT_ID for an address with invalid characters', async () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    // Valid length and starts with C but has invalid chars (lowercase)
    await expect(
      kit.contract('Ccfovcosnzbogaqlvqkyfbi5wz26einxuhh2dw4j4f3g2mpspbu3dvo5'),
    ).rejects.toMatchObject({ code: 'INVALID_CONTRACT_ID' })
  })
})

describe('StellarContractsKit - spec cache', () => {
  it('clearSpecCache does not throw when cache is empty', () => {
    const kit = new StellarContractsKit({ network: 'testnet' })
    expect(() => kit.clearSpecCache()).not.toThrow()
    expect(() => kit.clearSpecCache('CABC...')).not.toThrow()
  })
})

describe('WalletAdapter - interface compliance', () => {
  it('FreighterAdapter has all required interface properties', () => {
    const adapter = new FreighterAdapter()
    expect(typeof adapter.name).toBe('string')
    expect(typeof adapter.installUrl).toBe('string')
    expect(typeof adapter.isAvailable).toBe('function')
    expect(typeof adapter.connect).toBe('function')
    expect(typeof adapter.disconnect).toBe('function')
    expect(typeof adapter.getAddress).toBe('function')
    expect(typeof adapter.getNetworkPassphrase).toBe('function')
    expect(typeof adapter.signTransaction).toBe('function')
    expect(typeof adapter.signAuthEntry).toBe('function')
  })

  it('LobstrAdapter has all required interface properties', () => {
    const adapter = new LobstrAdapter()
    expect(typeof adapter.name).toBe('string')
    expect(typeof adapter.installUrl).toBe('string')
    expect(typeof adapter.isAvailable).toBe('function')
    expect(typeof adapter.connect).toBe('function')
    expect(typeof adapter.disconnect).toBe('function')
    expect(typeof adapter.getAddress).toBe('function')
    expect(typeof adapter.getNetworkPassphrase).toBe('function')
    expect(typeof adapter.signTransaction).toBe('function')
    expect(typeof adapter.signAuthEntry).toBe('function')
  })

  it('LobstrAdapter.signAuthEntry rejects with WALLET_REJECTED', async () => {
    const adapter = new LobstrAdapter()
    await expect(
      adapter.signAuthEntry('xdr', { networkPassphrase: 'test' }),
    ).rejects.toSatisfy((err: unknown) =>
      isContractKitError(err) && err.code === 'WALLET_REJECTED',
    )
  })

  it('LobstrAdapter.getNetworkPassphrase rejects with RPC_ERROR', async () => {
    const adapter = new LobstrAdapter()
    await expect(adapter.getNetworkPassphrase()).rejects.toMatchObject({ code: 'RPC_ERROR' })
  })
})
