export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

export class BoundedRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>()
  private nextCleanupAt = 0

  constructor(private readonly options: {
    limit: number
    windowMs: number
    maxEntries: number
    cleanupIntervalMs?: number
    now?: () => number
  }) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new RangeError('Rate limit must be a positive integer')
    }
    if (!Number.isInteger(options.windowMs) || options.windowMs < 1) {
      throw new RangeError('Rate-limit window must be a positive integer')
    }
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new RangeError('Rate-limit capacity must be a positive integer')
    }
  }

  consume(key: string): RateLimitDecision {
    const now = this.options.now?.() ?? Date.now()
    this.cleanupExpired(now)

    const current = this.entries.get(key)
    if (current && current.resetAt > now) {
      if (current.count >= this.options.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
        }
      }
      current.count += 1
      return { allowed: true, retryAfterSeconds: 0 }
    }

    if (current) this.entries.delete(key)
    if (this.entries.size >= this.options.maxEntries) {
      this.cleanupExpired(now, true)
      if (this.entries.size >= this.options.maxEntries) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(this.options.windowMs / 1_000)),
        }
      }
    }

    this.entries.set(key, { count: 1, resetAt: now + this.options.windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  check(key: string): RateLimitDecision {
    const now = this.options.now?.() ?? Date.now()
    const current = this.entries.get(key)
    if (current && current.resetAt > now) {
      if (current.count >= this.options.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
        }
      }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  cleanup(): void {
    this.cleanupExpired(this.options.now?.() ?? Date.now(), true)
  }

  get size(): number {
    return this.entries.size
  }

  private cleanupExpired(now: number, force = false): void {
    if (!force && now < this.nextCleanupAt) return
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key)
    }
    this.nextCleanupAt = now + (this.options.cleanupIntervalMs ?? Math.min(this.options.windowMs, 60_000))
  }
}

export class ConcurrencyLimiter {
  private active = 0

  constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new RangeError('Concurrency limit must be a positive integer')
    }
  }

  tryAcquire(): (() => void) | null {
    if (this.active >= this.maximum) return null
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
    }
  }

  get activeCount(): number {
    return this.active
  }
}
