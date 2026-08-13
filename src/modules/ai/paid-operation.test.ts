import { describe, expect, it } from 'bun:test'
import { AppError } from '../../lib/errors'
import { BoundedRateLimiter, ConcurrencyLimiter } from '../../lib/in-memory-limits'
import { createPaidAiOperationRunner, type TokenBalanceStore } from './paid-operation'

const createTokenStore = (initialBalance: number) => {
  let balance = initialBalance
  let refunds = 0
  const store: TokenBalanceStore = {
    async reserve() {
      if (balance < 1) return null
      balance -= 1
      return balance
    },
    async refund() {
      balance += 1
      refunds += 1
    },
  }
  return {
    store,
    balance: () => balance,
    refunds: () => refunds,
  }
}

const controls = (store: TokenBalanceStore) => ({
  tokenStore: store,
  rateLimiter: new BoundedRateLimiter({ limit: 10, windowMs: 60_000, maxEntries: 10 }),
  concurrencyLimiter: new ConcurrencyLimiter(2),
})

describe('paid AI operation controls', () => {
  it('reserves one token before the provider operation and returns the new balance', async () => {
    const tokens = createTokenStore(2)
    const run = createPaidAiOperationRunner(controls(tokens.store))
    let balanceSeenByProvider = -1

    const result = await run('user-1', async () => {
      balanceSeenByProvider = tokens.balance()
      return 'completed'
    })

    expect(balanceSeenByProvider).toBe(1)
    expect(result).toEqual({ value: 'completed', tokenBalance: 1 })
    expect(tokens.refunds()).toBe(0)
  })

  it('refunds the reservation when the provider operation fails', async () => {
    const tokens = createTokenStore(1)
    const run = createPaidAiOperationRunner(controls(tokens.store))
    const providerError = new Error('provider failed')

    await expect(run('user-1', async () => {
      throw providerError
    })).rejects.toBe(providerError)

    expect(tokens.balance()).toBe(1)
    expect(tokens.refunds()).toBe(1)
  })

  it('returns a clear payment error without calling the provider when depleted', async () => {
    const tokens = createTokenStore(0)
    const run = createPaidAiOperationRunner(controls(tokens.store))
    let providerCalled = false

    const promise = run('user-1', async () => {
      providerCalled = true
      return 'unexpected'
    })

    await expect(promise).rejects.toEqual(expect.objectContaining<AppError>({
      status: 402,
      errorCode: 'TOKEN_BALANCE_DEPLETED',
    }))
    expect(providerCalled).toBe(false)
    expect(tokens.balance()).toBe(0)
  })

  it('does not reserve a token when concurrency is already exhausted', async () => {
    const tokens = createTokenStore(1)
    const concurrencyLimiter = new ConcurrencyLimiter(1)
    const release = concurrencyLimiter.tryAcquire()
    const run = createPaidAiOperationRunner({
      ...controls(tokens.store),
      concurrencyLimiter,
    })

    await expect(run('user-1', async () => 'unexpected')).rejects.toEqual(
      expect.objectContaining<AppError>({ status: 429, errorCode: 'AI_BUSY' }),
    )
    expect(tokens.balance()).toBe(1)
    release?.()
  })
})
