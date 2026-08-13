import { AiError } from '../errors'
import type { KokoroPort, ProviderMetadata, SpeechSynthesisRequest, SpeechSynthesisResult } from '../types'

const DEFAULT_MODEL = 'kokoro-82m'

export interface EliceKokoroOptions {
  apiKey: string
  baseUrl: string
  model?: string
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
}

const synthesisUrl = (baseUrl: string) => {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return normalized.endsWith('/synthesize') ? normalized : `${normalized}/synthesize`
}

const providerError = (status: number, message: string) => new AiError({
  message: message.includes('target_api_mismatch')
    ? 'The configured Elice API key does not have access to this Kokoro endpoint. Create or select an API key authorized for the Kokoro service, then update ELICE_API_KEY.'
    : message || 'Kokoro could not create the interviewer voice.',
  code: status === 401 || status === 403 ? 'AI_AUTHENTICATION_ERROR' : status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR',
  status: status === 401 || status === 403 || status === 429 ? 503 : 502,
  retryable: status === 429 || status >= 500,
  providerStatus: status,
})

export class EliceKokoroAdapter implements KokoroPort {
  private readonly apiKey: string
  private readonly endpoint: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(options: EliceKokoroOptions) {
    if (!options.apiKey.trim()) throw new AiError({ message: 'ELICE_API_KEY is required to use Kokoro voice.', code: 'AI_CONFIGURATION_ERROR', status: 503 })
    if (!options.baseUrl.trim()) throw new AiError({ message: 'ELICE_KOKORO_BASE_URL is required to use Kokoro voice.', code: 'AI_CONFIGURATION_ERROR', status: 503 })
    this.apiKey = options.apiKey
    this.endpoint = synthesisUrl(options.baseUrl)
    this.model = options.model || DEFAULT_MODEL
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  async synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    const text = request.text.trim().slice(0, 4_000)
    if (!text) throw new AiError({ message: 'Speech text is required.', code: 'AI_BAD_REQUEST', status: 422 })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const startedAt = Date.now()
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'audio/*',
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, language: request.language, voice: request.voice || 'af_heart', speed: request.speed ?? 1 }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 500)
        throw providerError(response.status, detail || 'Kokoro could not create the interviewer voice.')
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (!bytes.byteLength) throw new AiError({ message: 'Kokoro returned an empty audio response.', code: 'AI_INVALID_RESPONSE', status: 502, retryable: true })
      const contentType = response.headers.get('content-type')?.split(';', 1)[0] || 'audio/wav'
      const metadata: ProviderMetadata = {
        provider: 'elice', model: this.model, requestId: response.headers.get('x-request-id') || undefined,
        usage: { promptTokens: 0, completionTokens: 0, cachedPromptTokens: 0 }, latencyMs: Date.now() - startedAt,
      }
      return { dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`, contentType, metadata }
    } catch (error) {
      if (error instanceof AiError) throw error
      throw new AiError({
        message: controller.signal.aborted ? 'Kokoro voice generation timed out.' : 'Kokoro voice generation could not be reached.',
        code: controller.signal.aborted ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR', status: controller.signal.aborted ? 504 : 502, retryable: true, cause: error,
      })
    } finally { clearTimeout(timeout) }
  }
}

export const createEliceKokoroFromEnv = () => new EliceKokoroAdapter({
  apiKey: process.env.ELICE_KOKORO_API_KEY || process.env.ELICE_API_KEY || '',
  baseUrl: process.env.ELICE_KOKORO_BASE_URL || '',
  model: process.env.ELICE_KOKORO_MODEL || DEFAULT_MODEL,
  timeoutMs: Number(process.env.ELICE_TIMEOUT_MS) || 120_000,
})