type NodeEnvironment = 'development' | 'test' | 'production'

function readNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (!value) return 'development'
  if (value === 'development' || value === 'test' || value === 'production') return value
  throw new Error('NODE_ENV must be development, test, or production')
}

function readInteger(name: string, value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function readBoolean(name: string, value: string | undefined, fallback: boolean) {
  if (!value) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be true or false`)
}

function readSameSite(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() || 'lax'
  if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') return normalized
  throw new Error('COOKIE_SAME_SITE must be lax, strict, or none')
}

function readUrl(name: string, value: string | undefined, required = false) {
  const normalized = value?.trim().replace(/\/$/, '') ?? ''
  if (!normalized) {
    if (required) throw new Error(`${name} is required`)
    return ''
  }

  try {
    return new URL(normalized).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${name} must be a valid absolute URL`)
  }
}

const nodeEnv = readNodeEnvironment(Bun.env.NODE_ENV)
const configuredSessionSecret = Bun.env.SESSION_SECRET?.trim() || Bun.env.JWT_SECRET?.trim() || ''

const insecureSessionSecrets = new Set([
  'development-only-minerva-session-secret-change-me',
  'replace-with-a-random-secret-at-least-32-characters',
])
if (nodeEnv !== 'test' && (!configuredSessionSecret || insecureSessionSecrets.has(configuredSessionSecret))) {
  throw new Error('SESSION_SECRET must be set to a unique value of at least 32 characters')
}
if (configuredSessionSecret && configuredSessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters')
}
const adminEmails = new Set((Bun.env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
const cookieSameSite = readSameSite(Bun.env.COOKIE_SAME_SITE)
const cookieSecure = readBoolean('COOKIE_SECURE', Bun.env.COOKIE_SECURE, nodeEnv === 'production')
if (nodeEnv === 'production' && !cookieSecure) throw new Error('COOKIE_SECURE must be true in production')
if (cookieSameSite === 'none' && !cookieSecure) throw new Error('COOKIE_SECURE must be true when COOKIE_SAME_SITE=none')

export const config = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: readInteger('PORT', Bun.env.PORT, 3000, 1, 65_535),
  frontendOrigin: readUrl('FRONTEND_ORIGIN', Bun.env.FRONTEND_ORIGIN ?? 'http://localhost:5173', true),
  mongoUri: Bun.env.MONGODB_URI?.trim() ?? '',
  sessionSecret: configuredSessionSecret || 'test-only-minerva-session-secret-0000000000',
  cookieSameSite,
  adminEmails,
  cookieSecure,
  sessionTtlSeconds: readInteger(
    'SESSION_TTL_SECONDS',
    Bun.env.SESSION_TTL_SECONDS,
    60 * 60 * 24 * 7,
    60 * 5,
    60 * 60 * 24 * 90,
  ),
  eliceApiKey: Bun.env.ELICE_API_KEY?.trim() ?? '',
  eliceTerraBaseUrl: readUrl('ELICE_TERRA_BASE_URL', Bun.env.ELICE_TERRA_BASE_URL),
  eliceWhisperBaseUrl: readUrl('ELICE_WHISPER_BASE_URL', Bun.env.ELICE_WHISPER_BASE_URL),
  eliceTimeoutMs: readInteger('ELICE_TIMEOUT_MS', Bun.env.ELICE_TIMEOUT_MS, 120_000, 1_000, 300_000),
  googleClientId: Bun.env.GOOGLE_CLIENT_ID?.trim() ?? '',
  googleClientSecret: Bun.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
  googleRedirectUri:
    readUrl('GOOGLE_REDIRECT_URI', Bun.env.GOOGLE_REDIRECT_URI) ||
    'http://localhost:3000/api/auth/google/callback',
  resendApiKey: Bun.env.RESEND_API_KEY?.trim() ?? '',
  resendFrom: Bun.env.RESEND_FROM?.trim() ?? '',
  uploadMaxBytes: readInteger('UPLOAD_MAX_BYTES', Bun.env.UPLOAD_MAX_BYTES, 25_000_000, 1_024, 100_000_000),
})
