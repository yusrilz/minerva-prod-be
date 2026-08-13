import { describe, expect, it } from 'bun:test'
import { BoundedRateLimiter, ConcurrencyLimiter } from './in-memory-limits'

describe('BoundedRateLimiter', () => {
  it('limits a key until its fixed window expires', () => {
    let now = 1_000
    const limiter = new BoundedRateLimiter({
      limit: 2,
      windowMs: 5_000,
      maxEntries: 10,
      now: () => now,
    })

    expect(limiter.consume('client').allowed).toBe(true)
    expect(limiter.consume('client').allowed).toBe(true)
    expect(limiter.consume('client')).toEqual({ allowed: false, retryAfterSeconds: 5 })

    now += 5_000
    expect(limiter.consume('client').allowed).toBe(true)
  })

  it('stays bounded and frees expired entries during cleanup', () => {
    let now = 0
    const limiter = new BoundedRateLimiter({
      limit: 1,
      windowMs: 1_000,
      maxEntries: 2,
      cleanupIntervalMs: 1,
      now: () => now,
    })

    expect(limiter.consume('one').allowed).toBe(true)
    expect(limiter.consume('two').allowed).toBe(true)
    expect(limiter.consume('three').allowed).toBe(false)
    expect(limiter.size).toBe(2)

    now = 1_001
    limiter.cleanup()
    expect(limiter.size).toBe(0)
    expect(limiter.consume('three').allowed).toBe(true)
  })
})

describe('ConcurrencyLimiter', () => {
  it('rejects excess work and releases capacity exactly once', () => {
    const limiter = new ConcurrencyLimiter(1)
    const release = limiter.tryAcquire()

    expect(release).not.toBeNull()
    expect(limiter.activeCount).toBe(1)
    expect(limiter.tryAcquire()).toBeNull()

    release?.()
    release?.()
    expect(limiter.activeCount).toBe(0)
    expect(limiter.tryAcquire()).not.toBeNull()
  })
})
