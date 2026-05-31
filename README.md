# stellar-contracts-kit

[![npm](https://img.shields.io/npm/v/stellar-contracts-kit)](https://www.npmjs.com/package/stellar-contracts-kit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

TypeScript SDK for Soroban smart contracts on Stellar. Handles wallet connection, typed contract clients, and a CLI that generates TypeScript interfaces directly from any live on-chain contract.

---

## Features

- **CLI code generator**: `npx sck` generates fully-typed TypeScript or JavaScript interfaces from any live contract spec
- **Interactive CLI**: arrow-key command picker, input validation, network selection
- **Built-in wallet modal**: auto-detects Freighter, Cyphras, and Lobstr, opens a picker UI when no wallet is specified
- **Three call modes**: auto, read-only, and force-invoke on every contract method
- **Full type coverage**: structs, enums, unions, tuples, `Uint8Array`, `bigint`, `Option`, `Vec`, `Map`
- **Contract spec caching**: spec fetched once per contract ID, subsequent calls are instant
- **Contract restore**: one-call recovery when a contract's on-chain state has expired
- Works with any frontend framework (React, Vue, Svelte, vanilla JS)

---

## Installation

```bash
npm install stellar-contracts-kit
```

---

## CLI

### Interactive mode

```bash
npx sck
```

Launches an arrow-key menu to pick a command, then guides you through the rest.

### Generate types

Fetch a live contract spec and generate a typed TypeScript interface + example file:

```bash
npx sck generate --contract CABC... --network testnet
```

Or add it as an npm script so the team can run it without `npx`:

```json
"scripts": {
  "generate": "sck generate --contract CABC... --network testnet"
}
```

```bash
npm run generate
```

With options:

```bash
npx sck generate \
  --contract CABC... \
  --network testnet \
  --name CounterContract \
  --out src/contracts/counter.ts
```

For JavaScript output:

```bash
npx sck generate --contract CABC... --network testnet --js
```

**Output files:**

| File | Description |
|------|-------------|
| `contracts/counter.ts` | TypeScript interface + custom types + contract ID |
| `contracts/counter.example.ts` | Ready-to-adapt usage example for every method |

**Generated `contracts/counter.ts`:**

```ts
import type { ContractMethodFn } from 'stellar-contracts-kit'

export interface CounterContract {
  get:       ContractMethodFn<number, []>
  increment: ContractMethodFn<number, []>
  reset:     ContractMethodFn<void,   []>
}

export const CONTRACT_ID = 'CABC...' as const
```

Re-run `npx sck generate` after a contract upgrade to refresh the types.

### Inspect a contract

Print all functions and custom types for any contract directly in the terminal, without generating files:

```bash
npx sck inspect --contract CABC... --network testnet
```

**Output:**

```
Contract : CABC...
Network  : testnet

Functions (5)
  get()                                              -> number
  increment()                                        -> number
  reset()                                            -> void
  transfer(from: string, to: string, amount: bigint) -> void
  balance(account: string)                           -> bigint

Custom Types (2)
  struct TokenInfo { symbol: string, decimals: number }
  enum   Status    { Active = 0, Inactive = 1 }
```

### Custom network

```bash
npx sck generate \
  --contract CABC... \
  --rpc-url https://my-rpc.example.com \
  --passphrase "My Custom Network"
```

### CLI options

```
Commands:
  npx sck generate [options]    Generate TypeScript types and example file
  npx sck inspect  [options]    Print contract interface to the terminal
  npx sck                       Interactive mode (arrow-key selection)

Shared options:
  --contract     Contract address (C..., 56 chars)   [required]
  --network      testnet | mainnet | futurenet
  --rpc-url      Custom RPC URL
  --passphrase   Custom network passphrase

Generate-only options:
  --out          Output file path        (default: ./contracts/<name>.ts)
  --name         Interface name          (default: derived from --out)
  --alias        tsconfig path alias     (auto-detected from tsconfig.json)
  --js           JavaScript output instead of TypeScript
  --help, -h     Show help
```

---

## SDK

### Quick start

```ts
import { StellarContractsKit } from 'stellar-contracts-kit'

const kit = new StellarContractsKit({ network: 'testnet' })

// Opens built-in wallet picker modal
const { address } = await kit.connect()

// Load a contract client
const counter = await kit.contract('CABC...')

// Read-only (no wallet, no TX)
const { result } = await counter.get.read()

// Write (requires connected wallet)
const { txHash } = await counter.increment.invoke()
```

### With generated types

```ts
import type { CounterContract } from './contracts/counter.js'
import { CONTRACT_ID } from './contracts/counter.js'

const counter = await kit.contract<CounterContract>(CONTRACT_ID)

// Full IDE autocomplete + type checking on all methods
const { result } = await counter.get.read()
const { txHash } = await counter.increment.invoke()
```

---

## Wallet Connection

### Built-in modal (recommended)

Calling `connect()` with no wallet configured opens a modal that auto-detects installed wallets:

```ts
const kit = new StellarContractsKit({ network: 'testnet' })
const { address } = await kit.connect()
```

The modal shows all supported wallets in order, with "Install" links for wallets that are not detected.

### Specific wallet adapter

```ts
import { StellarContractsKit, FreighterAdapter } from 'stellar-contracts-kit'

const kit = new StellarContractsKit({
  network: 'testnet',
  wallet: new FreighterAdapter(),
})
const { address } = await kit.connect()
```

### Supported wallets

| Wallet | Adapter | Install |
|--------|---------|---------|
| [Freighter](https://github.com/stellar/freighter) | `FreighterAdapter` | [freighter.app](https://freighter.app) |
| [Cyphras](https://github.com/cyphras/cyphras-extension) | `CyphrasAdapter` | [cyphras.com](https://cyphras.com) |
| [Lobstr](https://github.com/Lobstrco/lobstr-browser-extension) | `LobstrAdapter` | [lobstr.co](https://lobstr.co) |

### Other wallet methods

```ts
await kit.disconnect()
kit.isConnected() // boolean
await kit.getAddress() // string, throws WALLET_NOT_CONNECTED if none
kit.getWallet() // WalletAdapter | null
kit.setWallet(adapter) // replace active wallet
```

---

## Contract Interaction

### Call modes

Every method on the contract client has three modes:

```ts
// Auto: simulates first, submits TX only if auth is required
const result = await counter.increment()

// Read: simulate only, no wallet needed, no TX submitted
const { result } = await counter.get.read()

// Invoke: always submits a TX, requires a connected wallet
const { txHash, result } = await counter.increment.invoke()
```

### Passing arguments

Arguments are passed positionally in the order defined by the contract:

```ts
const { result } = await token.balance.read(userAddress)
const { txHash } = await token.transfer.invoke(from, to, amount)
```

### Spec caching

The contract spec is fetched once per contract ID and cached in memory. Subsequent `kit.contract()` calls with the same ID return instantly:

```ts
const counter = await kit.contract<CounterContract>(CONTRACT_ID) // fetches spec
const counter2 = await kit.contract<CounterContract>(CONTRACT_ID) // instant

kit.clearSpecCache(CONTRACT_ID) // clear one
kit.clearSpecCache() // clear all
```

---

## Custom Networks

```ts
const kit = new StellarContractsKit({
  network: {
    rpcUrl: 'https://my-soroban-rpc.example.com',
    networkPassphrase: 'My Custom Network',
    horizonUrl: 'https://my-horizon.example.com',
  },
})
```

Built-in network presets:

```ts
import { NETWORKS } from 'stellar-contracts-kit'

NETWORKS.testnet // Test SDF Network
NETWORKS.mainnet // Public Global Stellar Network
NETWORKS.futurenet // Test SDF Future Network
```

---

## Error Handling

All errors thrown by the kit are `StellarContractError` instances with a `code` property:

```ts
import { isContractKitError } from 'stellar-contracts-kit'

try {
  await counter.increment.invoke()
} catch (err) {
  if (isContractKitError(err)) {
    switch (err.code) {
      case 'WALLET_REJECTED':
        console.log('User rejected the transaction.')
        break
      case 'CONTRACT_RESTORE_REQUIRED':
        await kit.restoreContract(CONTRACT_ID)
        await counter.increment.invoke() // retry
        break
      case 'TX_FAILED':
        console.error('On-chain failure:', err.message)
        break
    }
  }
}
```

### Error codes

| Code | Description |
|------|-------------|
| `WALLET_NOT_FOUND` | Wallet extension not installed |
| `WALLET_NOT_CONNECTED` | No wallet is connected |
| `WALLET_REJECTED` | User rejected the connection or signing request |
| `WALLET_NETWORK_MISMATCH` | Wallet is on a different network than the kit |
| `CONTRACT_NOT_FOUND` | Contract does not exist on the network |
| `CONTRACT_SPEC_ERROR` | Could not parse the contract WASM spec |
| `CONTRACT_SIMULATION_FAILED` | Transaction simulation failed |
| `CONTRACT_RESTORE_REQUIRED` | Contract state expired, call `restoreContract()` |
| `INVALID_CONTRACT_ID` | Invalid contract address format |
| `INVALID_PARAMS` | Wrong number of arguments passed to a method |
| `TX_SUBMISSION_FAILED` | Transaction rejected at submission |
| `TX_FAILED` | Transaction accepted but failed on-chain |
| `TX_TIMEOUT` | Transaction not confirmed within the polling window |
| `RPC_ERROR` | RPC call failed or returned an unexpected response |
| `UNKNOWN` | Unexpected error |

---

## Restoring Expired Contracts

Soroban contracts can expire when their TTL runs out. Any call that touches expired state throws `CONTRACT_RESTORE_REQUIRED`. Use `restoreContract()` to recover:

```ts
try {
  await counter.increment.invoke()
} catch (err) {
  if (isContractKitError(err) && err.code === 'CONTRACT_RESTORE_REQUIRED') {
    const { txHash } = await kit.restoreContract(CONTRACT_ID)
    console.log('Restored:', txHash)
    await counter.increment.invoke() // retry
  }
}
```

---

## Custom Wallet Adapter

Implement `WalletAdapter` to add support for any wallet:

```ts
import type { WalletAdapter } from 'stellar-contracts-kit'

class MyWalletAdapter implements WalletAdapter {
  readonly name = 'MyWallet'
  readonly installUrl = 'https://mywallet.example.com'

  isAvailable(): boolean | Promise<boolean> { ... }
  async connect(): Promise<{ address: string }> { ... }
  async disconnect(): Promise<void> { ... }
  async getAddress(): Promise<string> { ... }
  async getNetworkPassphrase(): Promise<string> { ... }
  async signTransaction(xdr: string, opts): Promise<string> { ... }
  async signAuthEntry(entryXdr: string, opts): Promise<string> { ... }
}
```

---

## API Reference

### `StellarContractsKit`

```ts
new StellarContractsKit(options: StellarContractsKitOptions)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<{ address: string }>` | Connect to wallet or open picker modal |
| `disconnect()` | `Promise<void>` | Disconnect and clear the active wallet |
| `isConnected()` | `boolean` | True if a wallet is active |
| `getAddress()` | `Promise<string>` | Address of the connected wallet |
| `getWallet()` | `WalletAdapter \| null` | Active wallet adapter |
| `setWallet(adapter)` | `void` | Set or replace the active wallet |
| `getNetwork()` | `NetworkConfig` | Current network configuration |
| `contract<T>(id)` | `Promise<T>` | Load a typed contract client |
| `restoreContract(id)` | `Promise<{ txHash: string }>` | Restore expired contract state |
| `clearSpecCache(id?)` | `void` | Clear cached spec for one or all contracts |

### `ContractMethodFn<TReturn, TArgs>`

The type for each method on a generated contract interface:

```ts
ContractMethodFn<TReturn, TArgs extends unknown[] = unknown[]>
```

| Type param | Description |
|------------|-------------|
| `TReturn` | Return value type (`number`, `bigint`, `string`, `void`, custom struct, ...) |
| `TArgs` | Labeled tuple of argument types (`[from: string, amount: bigint]`) |

---

## License

[MIT](LICENSE)
