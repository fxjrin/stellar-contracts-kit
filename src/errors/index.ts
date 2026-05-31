export type ErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'WALLET_NOT_CONNECTED'
  | 'WALLET_REJECTED'
  | 'WALLET_NETWORK_MISMATCH'
  | 'CONTRACT_NOT_FOUND'
  | 'CONTRACT_SPEC_ERROR'
  | 'CONTRACT_SIMULATION_FAILED'
  | 'CONTRACT_RESTORE_REQUIRED'
  | 'INVALID_CONTRACT_ID'
  | 'INVALID_PARAMS'
  | 'TX_SUBMISSION_FAILED'
  | 'TX_TIMEOUT'
  | 'TX_FAILED'
  | 'RPC_ERROR'
  | 'UNKNOWN'

export interface ContractKitError {
  code: ErrorCode
  message: string
  cause?: unknown
}

export class StellarContractError extends Error {
  readonly code: ErrorCode
  readonly cause?: unknown

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'StellarContractError'
    this.code = code
    this.cause = cause
  }
}

export function makeError(code: ErrorCode, message: string, cause?: unknown): StellarContractError {
  return new StellarContractError(code, message, cause)
}

export function isContractKitError(err: unknown): err is StellarContractError {
  return err instanceof StellarContractError
}
