import { AppError } from '../../lib/errors'
import { BoundedRateLimiter, ConcurrencyLimiter } from '../../lib/in-memory-limits'

type AuthOperation = 'register' | 'login' | 'forgot'

const registerAttempts = new BoundedRateLimiter({
  limit: 6,
  windowMs: 5 * 60_000,
  maxEntries: 10_000,
})

const loginAttempts = new BoundedRateLimiter({
  limit: 5,
  windowMs: 60_000,
  maxEntries: 10_000,
})

const forgotAttempts = new BoundedRateLimiter({
  limit: 5,
  windowMs: 15 * 60_000,
  maxEntries: 10_000,
})

const argon2Concurrency = new ConcurrencyLimiter(4)

const clientKey = (request: Request, remoteAddress?: string): string => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = remoteAddress?.trim()
    || request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || forwarded
    || 'unknown-client'
  return address.slice(0, 128)
}

export const enforceAuthAttemptLimit = (request: Request, operation: AuthOperation, remoteAddress?: string): void => {
  const limiter = operation === 'register' ? registerAttempts : operation === 'login' ? loginAttempts : forgotAttempts
  const decision = limiter.consume(clientKey(request, remoteAddress))
  if (!decision.allowed) {
    throw new AppError(
      429,
      'AUTH_RATE_LIMITED',
      'Too many authentication attempts. Please try again shortly.',
      { retryAfterSeconds: decision.retryAfterSeconds },
    )
  }
}

export const checkLoginAttemptLimit = (request: Request, remoteAddress?: string): void => {
  const decision = loginAttempts.check(clientKey(request, remoteAddress))
  if (!decision.allowed) {
    throw new AppError(
      429,
      'AUTH_RATE_LIMITED',
      'Too many failed authentication attempts. Please try again shortly.',
      { retryAfterSeconds: decision.retryAfterSeconds },
    )
  }
}

export const recordFailedLoginAttempt = (request: Request, remoteAddress?: string): void => {
  loginAttempts.consume(clientKey(request, remoteAddress))
}

export const withArgon2Capacity = async <T>(operation: () => Promise<T>): Promise<T> => {
  const release = argon2Concurrency.tryAcquire()
  if (!release) {
    throw new AppError(
      429,
      'AUTH_BUSY',
      'Too many authentication attempts are being processed. Please try again shortly.',
    )
  }

  try {
    return await operation()
  } finally {
    release()
  }
}
