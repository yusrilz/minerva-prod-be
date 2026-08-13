import { AiError } from '../errors'
import type {
  ProviderMetadata,
  TranscriptChunk,
  TranscriptResult,
  TranscriptionRequest,
  WhisperPort,
} from '../types'
import { expectRecord, expectString, isRecord } from '../validation'

const DEFAULT_WHISPER_BASE_URL = 'https://mlapi.run/805a20fb-b66b-4b7c-84fb-079c12b76937'
const DEFAULT_MODEL = 'whisper-large-v3'

export interface EliceWhisperOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  timeoutMs?: number
  maxRetries?: number
  fetch?: typeof globalThis.fetch
}

const transcriptionUrl = (baseUrl: string): string => {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/v1/audio/transcriptions')) return normalized
  if (normalized.endsWith('/v1')) return `${normalized}/audio/transcriptions`
  return `${normalized}/v1/audio/transcriptions`
}

const numberOrZero = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

const parseTimestamp = (value: unknown, path: string): [number, number] => {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    value[0] < 0 ||
    value[1] < value[0]
  ) {
    throw new AiError({
      message: `Elice returned an invalid response: ${path} was not a valid timestamp.`,
      code: 'AI_INVALID_RESPONSE',
      status: 502,
      retryable: true,
    })
  }
  return [value[0], value[1]]
}

const parseChunks = (value: unknown): TranscriptChunk[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new AiError({
      message: 'Elice returned an invalid response: transcript.chunks must be an array.',
      code: 'AI_INVALID_RESPONSE',
      status: 502,
      retryable: true,
    })
  }
  return value.map((item, index) => {
    const chunk = expectRecord(item, `transcript.chunks[${index}]`)
    return {
      timestamp: parseTimestamp(chunk.timestamp, `transcript.chunks[${index}].timestamp`),
      text: expectString(chunk.text, `transcript.chunks[${index}].text`, { max: 20_000 }),
    }
  })
}

const safeProviderMessage = (body: unknown): string | undefined => {
  if (!isRecord(body)) return undefined
  const error = isRecord(body.error) ? body.error : body
  return typeof error.message === 'string' && error.message.trim()
    ? error.message.trim().slice(0, 500)
    : undefined
}

const responseError = (status: number, body: unknown): AiError => {
  if (status === 401 || status === 403) {
    return new AiError({
      message: 'Elice authentication failed. Check the server-side AI configuration.',
      code: 'AI_AUTHENTICATION_ERROR',
      status: 503,
      providerStatus: status,
    })
  }
  if (status === 429) {
    return new AiError({
      message: 'The transcription provider is busy. Please retry shortly.',
      code: 'AI_RATE_LIMITED',
      status: 503,
      retryable: true,
      providerStatus: status,
    })
  }
  if (status >= 400 && status < 500) {
    return new AiError({
      message: safeProviderMessage(body) || 'Elice rejected the audio file.',
      code: 'AI_BAD_REQUEST',
      status: 422,
      providerStatus: status,
    })
  }
  return new AiError({
    message: safeProviderMessage(body) || 'Elice could not transcribe the audio.',
    code: 'AI_PROVIDER_ERROR',
    status: 502,
    retryable: true,
    providerStatus: status,
  })
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export class EliceWhisperAdapter implements WhisperPort {
  private readonly apiKey: string
  private readonly endpoint: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(options: EliceWhisperOptions) {
    if (!options.apiKey.trim()) {
      throw new AiError({
        message: 'ELICE_API_KEY is required to use transcription.',
        code: 'AI_CONFIGURATION_ERROR',
        status: 503,
      })
    }
    this.apiKey = options.apiKey
    this.endpoint = transcriptionUrl(options.baseUrl || DEFAULT_WHISPER_BASE_URL)
    this.model = options.model || DEFAULT_MODEL
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.maxRetries = options.maxRetries ?? 2
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptResult> {
    let lastError: AiError | undefined

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const form = new FormData()
      form.append('file', request.audio, request.filename)
      form.append('model', this.model)
      form.append('return_timestamps', request.returnTimestamps === 'word' ? 'word' : 'true')
      if (request.language) form.append('language', request.language)

      const startedAt = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: form,
          signal: controller.signal,
        })
        const body = await response.json().catch(() => undefined) as unknown
        if (!response.ok) {
          const error = responseError(response.status, body)
          if (error.retryable && attempt < this.maxRetries) {
            lastError = error
            await delay(300 * 2 ** attempt)
            continue
          }
          throw error
        }

        const root = expectRecord(body, 'transcription')
        if (root._result !== undefined) {
          const resultStatus = expectRecord(root._result, '_result')
          if (resultStatus.status !== 'ok') {
            throw new AiError({
              message: 'Elice reported that transcription was not successful.',
              code: 'AI_PROVIDER_ERROR',
              status: 502,
              retryable: true,
            })
          }
        }
        const transcript = expectRecord(root.transcript, 'transcript')
        const text = expectString(transcript.text, 'transcript.text', { max: 250_000 })
        const metadata: ProviderMetadata = {
          provider: 'elice',
          model: this.model,
          requestId: response.headers.get('x-request-id') || undefined,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            cachedPromptTokens: 0,
          },
          latencyMs: Date.now() - startedAt,
        }

        return {
          text,
          chunks: parseChunks(transcript.chunks),
          language: typeof transcript.language === 'string' ? transcript.language : undefined,
          metadata,
        }
      } catch (error) {
        if (error instanceof AiError) throw error
        if (controller.signal.aborted) {
          lastError = new AiError({
            message: 'The Elice transcription request timed out.',
            code: 'AI_TIMEOUT',
            status: 504,
            retryable: true,
            cause: error,
          })
        } else {
          lastError = new AiError({
            message: 'The Elice transcription endpoint could not be reached.',
            code: 'AI_PROVIDER_ERROR',
            status: 502,
            retryable: true,
            cause: error,
          })
        }

        if (attempt < this.maxRetries) {
          await delay(300 * 2 ** attempt)
          continue
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError ?? new AiError({
      message: 'The Elice transcription request could not be completed.',
      code: 'AI_PROVIDER_ERROR',
      status: 502,
      retryable: true,
    })
  }
}

export const createEliceWhisperFromEnv = (): EliceWhisperAdapter =>
  new EliceWhisperAdapter({
    apiKey: process.env.ELICE_WHISPER_API_KEY || process.env.ELICE_API_KEY || '',
    baseUrl: process.env.ELICE_WHISPER_BASE_URL || DEFAULT_WHISPER_BASE_URL,
    model: process.env.ELICE_WHISPER_MODEL || DEFAULT_MODEL,
    timeoutMs: Number(process.env.ELICE_TIMEOUT_MS) || 120_000,
  })
