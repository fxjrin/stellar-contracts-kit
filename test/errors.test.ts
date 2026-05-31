import { describe, it, expect } from 'vitest'
import { StellarContractError, makeError, isContractKitError } from '../src/errors/index.js'

describe('makeError', () => {
  it('creates a StellarContractError with the correct code and message', () => {
    const err = makeError('WALLET_NOT_FOUND', 'wallet missing')
    expect(err).toBeInstanceOf(StellarContractError)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('WALLET_NOT_FOUND')
    expect(err.message).toBe('wallet missing')
    expect(err.name).toBe('StellarContractError')
  })

  it('attaches a cause when provided', () => {
    const cause = new Error('root cause')
    const err = makeError('UNKNOWN', 'wrapped', cause)
    expect(err.cause).toBe(cause)
  })

  it('cause is undefined when not provided', () => {
    const err = makeError('TX_FAILED', 'failed')
    expect(err.cause).toBeUndefined()
  })

  it('works for every defined error code', () => {
    const codes = [
      'WALLET_NOT_FOUND', 'WALLET_NOT_CONNECTED', 'WALLET_REJECTED',
      'WALLET_NETWORK_MISMATCH', 'CONTRACT_NOT_FOUND', 'CONTRACT_SPEC_ERROR',
      'CONTRACT_SIMULATION_FAILED', 'CONTRACT_RESTORE_REQUIRED',
      'INVALID_CONTRACT_ID', 'INVALID_PARAMS',
      'TX_SUBMISSION_FAILED', 'TX_TIMEOUT', 'TX_FAILED',
      'RPC_ERROR', 'UNKNOWN',
    ] as const
    for (const code of codes) {
      const err = makeError(code, 'test')
      expect(err.code).toBe(code)
    }
  })
})

describe('isContractKitError', () => {
  it('returns true for StellarContractError', () => {
    const err = makeError('TX_FAILED', 'failed')
    expect(isContractKitError(err)).toBe(true)
  })

  it('returns false for a plain Error', () => {
    expect(isContractKitError(new Error('plain'))).toBe(false)
  })

  it('returns false for null, string, and number', () => {
    expect(isContractKitError(null)).toBe(false)
    expect(isContractKitError('error')).toBe(false)
    expect(isContractKitError(42)).toBe(false)
  })

  it('returns false for a plain object that looks like an error', () => {
    expect(isContractKitError({ code: 'TX_FAILED', message: 'fake' })).toBe(false)
  })
})
