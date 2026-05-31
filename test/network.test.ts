import { describe, it, expect } from 'vitest'
import { NETWORKS, resolveNetwork } from '../src/network/config.js'

describe('NETWORKS', () => {
  it('has mainnet, testnet, and futurenet presets', () => {
    expect(NETWORKS.mainnet).toBeDefined()
    expect(NETWORKS.testnet).toBeDefined()
    expect(NETWORKS.futurenet).toBeDefined()
  })

  it('every preset has rpcUrl, networkPassphrase, and horizonUrl', () => {
    for (const [preset, config] of Object.entries(NETWORKS)) {
      expect(config.rpcUrl, `${preset}.rpcUrl`).toBeTruthy()
      expect(config.networkPassphrase, `${preset}.networkPassphrase`).toBeTruthy()
      expect(config.horizonUrl, `${preset}.horizonUrl`).toBeTruthy()
    }
  })

  it('testnet uses the correct passphrase', () => {
    expect(NETWORKS.testnet.networkPassphrase).toBe('Test SDF Network ; September 2015')
  })

  it('mainnet uses the correct passphrase', () => {
    expect(NETWORKS.mainnet.networkPassphrase).toBe('Public Global Stellar Network ; September 2015')
  })
})

describe('resolveNetwork', () => {
  it('resolves a preset string to the correct config', () => {
    expect(resolveNetwork('testnet')).toEqual(NETWORKS.testnet)
    expect(resolveNetwork('mainnet')).toEqual(NETWORKS.mainnet)
    expect(resolveNetwork('futurenet')).toEqual(NETWORKS.futurenet)
  })

  it('passes a custom NetworkConfig through unchanged', () => {
    const custom = {
      rpcUrl: 'https://my-rpc.example.com',
      networkPassphrase: 'My Custom Network',
      horizonUrl: 'https://my-horizon.example.com',
    }
    expect(resolveNetwork(custom)).toEqual(custom)
    expect(resolveNetwork(custom)).toBe(custom)
  })
})
