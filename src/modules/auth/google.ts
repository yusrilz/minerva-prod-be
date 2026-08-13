import { createSessionToken, authCookie, verifySessionToken } from '../../auth/session'
import { config } from '../../config/env'
import { AppError } from '../../lib/errors'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

export const OAUTH_STATE_COOKIE = 'minerva_oauth_state'
const OAUTH_STATE_TTL_SECONDS = 10 * 60

export function assertGoogleConfigured() {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured')
  }
}

// ponytail: reuse the session HMAC as a stateless nonce; the return path rides in the token so it survives Google's redirect.
export async function createOAuthStateToken(next: string): Promise<string> {
  return createSessionToken({ userId: `next:${next}`, role: 'user' }, OAUTH_STATE_TTL_SECONDS)
}

export function oauthStateCookie(state: string) {
  return authCookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_TTL_SECONDS)
}

export async function readOAuthNext(state: string): Promise<string | null> {
  const session = await verifySessionToken(state)
  if (!session || !session.userId.startsWith('next:')) return null
  const next = session.userId.slice(5)
  return /^\/(?!\/)/.test(next) ? next : null
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      redirect_uri: config.googleRedirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string }
  if (!response.ok || !payload.access_token) {
    throw new AppError(503, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be completed. Please try again.')
  }
  return payload.access_token
}

export interface GoogleProfile {
  email: string
  name?: string
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const profile = (await response.json().catch(() => ({}))) as { email?: string; name?: string }
  if (!response.ok || !profile.email) {
    throw new AppError(503, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be completed. Please try again.')
  }
  return { email: profile.email, name: profile.name }
}