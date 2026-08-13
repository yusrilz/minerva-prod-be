export type AiErrorCode =
  | 'AI_CONFIGURATION_ERROR'
  | 'AI_AUTHENTICATION_ERROR'
  | 'AI_BAD_REQUEST'
  | 'AI_RATE_LIMITED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_RESPONSE'

export class AiError extends Error {
  readonly code: AiErrorCode
  readonly status: number
  readonly retryable: boolean
  readonly providerStatus?: number

  constructor(options: {
    message: string
    code: AiErrorCode
    status: number
    retryable?: boolean
    providerStatus?: number
    cause?: unknown
  }) {
    super(options.message, { cause: options.cause })
    this.name = 'AiError'
    this.code = options.code
    this.status = options.status
    this.retryable = options.retryable ?? false
    this.providerStatus = options.providerStatus
  }
}

export const asAiError = (error: unknown): AiError => {
  if (error instanceof AiError) return error

  return new AiError({
    message: 'The AI request could not be completed.',
    code: 'AI_PROVIDER_ERROR',
    status: 502,
    retryable: true,
    cause: error,
  })
}
