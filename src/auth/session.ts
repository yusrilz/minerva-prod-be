import { config } from '../config/env'
import { AppError } from '../lib/errors'

export const SESSION_COOKIE_NAME = 'minerva_session'

export interface AuthSession {
  userId: string
  role: 'user' | 'admin'
}

interface SessionPayload {
  sub: string
  role: 'user' | 'admin'
  exp: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encodeBase64Url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value
  return Buffer.from(bytes).toString('base64url')
}

function decodeBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64url'))
}

async function signingKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(config.sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function createSessionToken(session: AuthSession, ttlSeconds = config.sessionTtlSeconds) {
  const payload: SessionPayload = {
    sub: session.userId,
    role: session.role,
    exp: Math.floor(Date.now() / 1_000) + ttlSeconds,
  }
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(encodedPayload))
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  const [encodedPayload, encodedSignature, extra] = token.split('.')
  if (!encodedPayload || !encodedSignature || extra) return null

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      decodeBase64Url(encodedSignature),
      encoder.encode(encodedPayload),
    )
    if (!valid) return null

    const payload = JSON.parse(decoder.decode(decodeBase64Url(encodedPayload))) as Partial<SessionPayload>
    if (
      typeof payload.sub !== 'string' ||
      (payload.role !== 'user' && payload.role !== 'admin') ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1_000)
    ) return null

    return { userId: payload.sub, role: payload.role }
  } catch {
    return null
  }
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get('cookie')
  if (!cookies) return null

  for (const part of cookies.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

export function readRequestCookie(request: Request, name: string) {
  return readCookie(request, name)
}

export async function getAuthSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE_NAME)
  return token ? verifySessionToken(token) : null
}

export function requireTrustedMutationOrigin(request: Request) {
  if (config.cookieSameSite !== 'none' || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const origin = request.headers.get('origin')
  if (origin !== config.frontendOrigin) throw new AppError(403, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed')
}

export async function requireAuth(request: Request) {
  const session = await getAuthSession(request)
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required')
  requireTrustedMutationOrigin(request)
  return session
}

function sessionCookieAttributes(maxAge: number) {
  // this part is modified to ensure [session and cookie security by enforcing HttpOnly, Secure, and SameSite=Strict flags unconditionally]
  const sameSite = 'Strict';
  const secure = '; Secure';
  return `Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`
}

export function authCookie(name: string, token: string, maxAge: number) {
  return `${name}=${encodeURIComponent(token)}; ${sessionCookieAttributes(maxAge)}`
}

export function sessionCookie(token: string, maxAge = config.sessionTtlSeconds) {
  return authCookie(SESSION_COOKIE_NAME, token, maxAge)
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; ${sessionCookieAttributes(0)}`
}
