import { describe, it, expect } from 'vitest'
import { xdr, contract } from '@stellar/stellar-sdk'
import { toTs, generateCustomTypes, generateExample } from '../src/cli/codegen.js'

// Helpers to construct ScSpecTypeDef values
const bool = () => xdr.ScSpecTypeDef.scSpecTypeBool()
const void_ = () => xdr.ScSpecTypeDef.scSpecTypeVoid()
const u32 = () => xdr.ScSpecTypeDef.scSpecTypeU32()
const i32 = () => xdr.ScSpecTypeDef.scSpecTypeI32()
const u64 = () => xdr.ScSpecTypeDef.scSpecTypeU64()
const i64 = () => xdr.ScSpecTypeDef.scSpecTypeI64()
const u128 = () => xdr.ScSpecTypeDef.scSpecTypeU128()
const i128 = () => xdr.ScSpecTypeDef.scSpecTypeI128()
const str = () => xdr.ScSpecTypeDef.scSpecTypeString()
const sym = () => xdr.ScSpecTypeDef.scSpecTypeSymbol()
const addr = () => xdr.ScSpecTypeDef.scSpecTypeAddress()
const bytes = () => xdr.ScSpecTypeDef.scSpecTypeBytes()

const option = (inner: xdr.ScSpecTypeDef) =>
  xdr.ScSpecTypeDef.scSpecTypeOption(new xdr.ScSpecTypeOption({ valueType: inner }))

const vec = (element: xdr.ScSpecTypeDef) =>
  xdr.ScSpecTypeDef.scSpecTypeVec(new xdr.ScSpecTypeVec({ elementType: element }))

const udt = (name: string) =>
  xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: Buffer.from(name) }))

describe('toTs', () => {
  it('maps primitive types correctly', () => {
    expect(toTs(bool())).toBe('boolean')
    expect(toTs(void_())).toBe('void')
    expect(toTs(u32())).toBe('number')
    expect(toTs(i32())).toBe('number')
    expect(toTs(u64())).toBe('bigint')
    expect(toTs(i64())).toBe('bigint')
    expect(toTs(u128())).toBe('bigint')
    expect(toTs(i128())).toBe('bigint')
    expect(toTs(str())).toBe('string')
    expect(toTs(sym())).toBe('string')
    expect(toTs(addr())).toBe('string')
    expect(toTs(bytes())).toBe('Uint8Array')
  })

  it('maps Option<T> to T | null', () => {
    expect(toTs(option(bool()))).toBe('boolean | null')
    expect(toTs(option(u64()))).toBe('bigint | null')
    expect(toTs(option(addr()))).toBe('string | null')
  })

  it('maps Vec<T> to Array<T>', () => {
    expect(toTs(vec(u32()))).toBe('Array<number>')
    expect(toTs(vec(str()))).toBe('Array<string>')
    expect(toTs(vec(addr()))).toBe('Array<string>')
  })

  it('maps nested generics correctly', () => {
    expect(toTs(option(vec(u64())))).toBe('Array<bigint> | null')
    expect(toTs(vec(option(bool())))).toBe('Array<boolean | null>')
  })

  it('maps UDT to the type name as-is', () => {
    expect(toTs(udt('MyStruct'))).toBe('MyStruct')
    expect(toTs(udt('TokenAmount'))).toBe('TokenAmount')
  })

  it('returns "unknown" for unrecognized switch names', () => {
    const fakeDef = { switch: () => ({ name: 'scSpecTypeUnknownFuture' }) } as any
    expect(toTs(fakeDef)).toBe('unknown')
  })
})

describe('generateCustomTypes', () => {
  it('returns empty string when there are no custom type entries', () => {
    // Only function entries, no UDT entries
    const result = generateCustomTypes([])
    expect(result.trim()).toBe('')
  })

  it('generates a TypeScript enum from a UDT enum entry', () => {
    const enumEntry = xdr.ScSpecEntry.scSpecEntryUdtEnumV0(
      new xdr.ScSpecUdtEnumV0({
        doc: '',
        name: Buffer.from('Status'),
        cases: [
          new xdr.ScSpecUdtEnumCaseV0({ doc: '', name: Buffer.from('Active'), value: 0 }),
          new xdr.ScSpecUdtEnumCaseV0({ doc: '', name: Buffer.from('Inactive'), value: 1 }),
        ],
      }),
    )

    const result = generateCustomTypes([enumEntry])
    expect(result).toContain('export enum Status {')
    expect(result).toContain('Active = 0,')
    expect(result).toContain('Inactive = 1,')
  })

  it('generates a TypeScript interface from a UDT struct entry', () => {
    const structEntry = xdr.ScSpecEntry.scSpecEntryUdtStructV0(
      new xdr.ScSpecUdtStructV0({
        doc: '',
        name: Buffer.from('TokenInfo'),
        fields: [
          new xdr.ScSpecUdtStructFieldV0({ doc: '', name: Buffer.from('symbol'), type: str() }),
          new xdr.ScSpecUdtStructFieldV0({ doc: '', name: Buffer.from('decimals'), type: u32() }),
        ],
      }),
    )

    const result = generateCustomTypes([structEntry])
    expect(result).toContain('export interface TokenInfo {')
    expect(result).toContain('symbol: string')
    expect(result).toContain('decimals: number')
  })

  it('generates a tuple type alias for a struct with all-numeric field names', () => {
    const tupleEntry = xdr.ScSpecEntry.scSpecEntryUdtStructV0(
      new xdr.ScSpecUdtStructV0({
        doc: '',
        name: Buffer.from('U256Wrapper'),
        fields: [
          new xdr.ScSpecUdtStructFieldV0({ doc: '', name: Buffer.from('0'), type: u128() }),
        ],
      }),
    )

    const result = generateCustomTypes([tupleEntry])
    expect(result).toContain('export type U256Wrapper = [bigint]')
    expect(result).not.toContain('export interface U256Wrapper')
  })
})

// Helper to build a ScSpecEntry for a function
function fnEntry(name: string, inputs: xdr.ScSpecFunctionInputV0[], outputs: xdr.ScSpecTypeDef[]) {
  return xdr.ScSpecEntry.scSpecEntryFunctionV0(
    new xdr.ScSpecFunctionV0({ doc: '', name: Buffer.from(name), inputs, outputs }),
  )
}

function input(name: string, type: xdr.ScSpecTypeDef) {
  return new xdr.ScSpecFunctionInputV0({ doc: '', name: Buffer.from(name), type })
}

describe('generateExample', () => {
  const CONTRACT_ID = 'CCFOVCOSNZBOGAQLVQKYFBI5WZ26EINXUHH2DW4J4F3G2MPSPBU3DVO5'

  it('contains the kit import and contract load boilerplate', () => {
    const spec = new contract.Spec([fnEntry('get', [], [u32()])])
    const out = generateExample(spec, CONTRACT_ID, 'CounterContract', 'counter', 'testnet')
    expect(out).toContain("import { StellarContractsKit } from 'stellar-contracts-kit'")
    expect(out).toContain("import type { CounterContract } from './counter.js'")
    expect(out).toContain("import { CONTRACT_ID } from './counter.js'")
    expect(out).toContain("kit.contract<CounterContract>(CONTRACT_ID)")
    expect(out).toContain("kit.connect()")
  })

  it('shows types file path hint when typesRelPath is provided', () => {
    const spec = new contract.Spec([fnEntry('get', [], [u32()])])
    const out = generateExample(spec, CONTRACT_ID, 'CounterContract', 'counter', 'testnet', 'src/contracts/counter.ts')
    expect(out).toContain('Types file: src/contracts/counter.ts')
  })

  it('shows generic update hint when typesRelPath is not provided', () => {
    const spec = new contract.Spec([fnEntry('get', [], [u32()])])
    const out = generateExample(spec, CONTRACT_ID, 'CounterContract', 'counter', 'testnet')
    expect(out).toContain('Update the import path below')
  })

  it('uses read() for a no-param method with a return value', () => {
    const spec = new contract.Spec([fnEntry('get', [], [u32()])])
    const out = generateExample(spec, CONTRACT_ID, 'CounterContract', 'counter', 'testnet')
    expect(out).toContain('contract.get.read()')
    expect(out).not.toContain('contract.get.invoke()')
  })

  it('uses invoke() for a void no-param method', () => {
    const spec = new contract.Spec([fnEntry('reset', [], [])])
    const out = generateExample(spec, CONTRACT_ID, 'CounterContract', 'counter', 'testnet')
    expect(out).toContain('contract.reset.invoke()')
  })

  it('uses invoke() for a method with params and return value', () => {
    const spec = new contract.Spec([fnEntry('transfer', [input('from', addr()), input('to', addr()), input('amount', u64())], [])])
    const out = generateExample(spec, CONTRACT_ID, 'TokenContract', 'token', 'testnet')
    expect(out).toContain('contract.transfer.invoke(')
    expect(out).toContain("'G...',  // from: string")
    expect(out).toContain("'G...',  // to: string")
    expect(out).toContain('0n,  // amount: bigint')
  })

  it('generates correct placeholder values for common types', () => {
    const spec = new contract.Spec([fnEntry('set', [
      input('flag', bool()),
      input('count', u32()),
      input('amount', u128()),
      input('label', str()),
    ], [])])
    const out = generateExample(spec, CONTRACT_ID, 'MyContract', 'my-contract', 'mainnet')
    expect(out).toContain('false,  // flag: boolean')
    expect(out).toContain('0,  // count: number')
    expect(out).toContain('0n,  // amount: bigint')
    expect(out).toContain("'',  // label: string")
  })

  it('uses the network preset string in kit initialization', () => {
    const spec = new contract.Spec([fnEntry('get', [], [u32()])])
    expect(generateExample(spec, CONTRACT_ID, 'C', 'c', 'testnet')).toContain("{ network: 'testnet' }")
    expect(generateExample(spec, CONTRACT_ID, 'C', 'c', 'mainnet')).toContain("{ network: 'mainnet' }")
  })

  it('includes the method signature as a comment', () => {
    const spec = new contract.Spec([fnEntry('balance', [input('account', addr())], [u64()])])
    const out = generateExample(spec, CONTRACT_ID, 'TokenContract', 'token', 'testnet')
    expect(out).toContain('// balance(account: string) -> bigint')
  })
})
