export interface NetworkConfig {
  rpcUrl: string
  networkPassphrase: string
  horizonUrl: string
}

export type NetworkPreset = 'mainnet' | 'testnet' | 'futurenet'

export const NETWORKS: Record<NetworkPreset, NetworkConfig> = {
  mainnet: {
    rpcUrl: 'https://mainnet.stellar.validationcloud.io/v1/soroban/rpc',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
  },
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  futurenet: {
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    networkPassphrase: 'Test SDF Future Network ; October 2022',
    horizonUrl: 'https://horizon-futurenet.stellar.org',
  },
}

export function resolveNetwork(network: NetworkPreset | NetworkConfig): NetworkConfig {
  if (typeof network === 'string') {
    return NETWORKS[network]
  }
  return network
}
