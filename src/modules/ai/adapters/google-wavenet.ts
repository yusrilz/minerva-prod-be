import { AiError } from '../errors'
import type { KokoroPort, ProviderMetadata, SpeechSynthesisRequest, SpeechSynthesisResult } from '../types'

type ServiceAccount = { client_email?: string; private_key?: string; token_uri?: string }
const b64 = (value: Uint8Array | string) => Buffer.from(value).toString('base64url')
const pemBytes = (pem: string) => Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64')

export class GoogleWaveNetAdapter implements KokoroPort {
  private token?: { value: string; expiresAt: number }
  constructor(private readonly credentialsPath: string, private readonly voice = 'en-US-Wavenet-F', private readonly fetchImpl: typeof fetch = fetch) {}

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value
    const account = await Bun.file(this.credentialsPath).json() as ServiceAccount
    if (!account.client_email || !account.private_key) throw new AiError({ message: 'Google TTS service-account credentials are incomplete.', code: 'AI_CONFIGURATION_ERROR', status: 503 })
    const now = Math.floor(Date.now() / 1000); const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: account.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
    const unsigned = `${header}.${claims}`
    const key = await crypto.subtle.importKey('pkcs8', pemBytes(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
    const signature = b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))))
    const response = await this.fetchImpl(account.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) })
    const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number }
    if (!response.ok || !body.access_token) throw new AiError({ message: 'Google Cloud authentication failed. Check the service account and Text-to-Speech API.', code: 'AI_AUTHENTICATION_ERROR', status: 503 })
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 }; return this.token.value
  }

  async synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    const text = request.text.trim().slice(0, 4_000); if (!text) throw new AiError({ message: 'Speech text is required.', code: 'AI_BAD_REQUEST', status: 422 })
    const response = await this.fetchImpl('https://texttospeech.googleapis.com/v1/text:synthesize', { method: 'POST', headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: { text }, voice: { languageCode: this.voice.slice(0, 5), name: this.voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: request.speed ?? 1 } }) })
    const body = await response.json().catch(() => ({})) as { audioContent?: string }
    if (!response.ok || !body.audioContent) throw new AiError({ message: 'Google WaveNet could not create the interviewer voice.', code: 'AI_PROVIDER_ERROR', status: 502, retryable: response.status >= 500 })
    const metadata: ProviderMetadata = { provider: 'google', model: this.voice, usage: { promptTokens: 0, completionTokens: 0, cachedPromptTokens: 0 }, latencyMs: 0 }
    return { dataUrl: `data:audio/mpeg;base64,${body.audioContent}`, contentType: 'audio/mpeg', metadata }
  }
}

export const createGoogleWaveNetFromEnv = () => new GoogleWaveNetAdapter(process.env.GOOGLE_TTS_CREDENTIALS_PATH || '', process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-F')