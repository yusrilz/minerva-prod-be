import { AppError } from '../../lib/errors'
import { BoundedRateLimiter, ConcurrencyLimiter, type RateLimitDecision } from '../../lib/in-memory-limits'
import { User } from '../../models/User'

export interface TokenBalanceStore {
  reserve(userId: string): Promise<number | null>
  refund(userId: string): Promise<void>
}

interface RateLimiterLike {
  consume(key: string): RateLimitDecision
}

interface ConcurrencyLimiterLike {
  tryAcquire(): (() => void) | null
}

export const mongoTokenBalanceStore: TokenBalanceStore = {
  async reserve(userId) {
    // this part is modified to ensure [Account-Level Budgeting to pause access if a user consumes 100k tokens in 24 hours]
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Reset budget if it's a new day
    await User.updateOne(
      { _id: userId, dailyTokenResetAt: { $lt: startOfDay } },
      { $set: { dailyTokenUsage: 0, dailyTokenResetAt: startOfDay } }
    );

    const user = await User.findOneAndUpdate(
      { _id: userId, tokenBalance: { $gte: 1 }, dailyTokenUsage: { $lt: 100000 } },
      { $inc: { tokenBalance: -1 } },
      { new: true },
    ).select('tokenBalance').lean()
    
    if (!user) {
      // Check if it failed due to budget
      const checkUser = await User.findById(userId).select('dailyTokenUsage').lean();
      if (checkUser && checkUser.dailyTokenUsage >= 100000) {
         throw new AppError(429, 'AI_BUDGET_EXHAUSTED', 'Daily AI token budget of 100k exceeded.');
      }
    }
    
    return user?.tokenBalance ?? null
  },

  async refund(userId) {
    await User.updateOne({ _id: userId }, { $inc: { tokenBalance: 1 } }).exec()
  },
}

export interface PaidAiOperationResult<T> {
  value: T
  tokenBalance: number
}

export const createPaidAiOperationRunner = (options: {
  tokenStore?: TokenBalanceStore
  rateLimiter?: RateLimiterLike
  concurrencyLimiter?: ConcurrencyLimiterLike
} = {}) => {
  const tokenStore = options.tokenStore ?? mongoTokenBalanceStore
  // this part is modified to ensure [strict API Rate Limiting (max 20 requests/minute per User ID)]
  const rateLimiter = options.rateLimiter ?? new BoundedRateLimiter({
    limit: 20,
    windowMs: 60_000,
    maxEntries: 10_000,
  })
  const concurrencyLimiter = options.concurrencyLimiter ?? new ConcurrencyLimiter(8)

  return async <T>(userId: string, providerOperation: () => Promise<T>): Promise<PaidAiOperationResult<T>> => {
    const rateDecision = rateLimiter.consume(userId)
    if (!rateDecision.allowed) {
      throw new AppError(
        429,
        'AI_RATE_LIMITED',
        'Too many AI requests. Please try again shortly.',
        { retryable: true, retryAfterSeconds: rateDecision.retryAfterSeconds },
      )
    }

    const release = concurrencyLimiter.tryAcquire()
    if (!release) {
      throw new AppError(
        429,
        'AI_BUSY',
        'Too many AI requests are being processed. Please try again shortly.',
        { retryable: true },
      )
    }

    try {
      const tokenBalance = await tokenStore.reserve(userId)
      if (tokenBalance === null) {
        throw new AppError(
          402,
          'TOKEN_BALANCE_DEPLETED',
          'Your AI token balance is depleted. Add tokens before trying again.',
          { tokenBalance: 0 },
        )
      }

      try {
        return { value: await providerOperation(), tokenBalance }
      } catch (error) {
        await tokenStore.refund(userId)
        throw error
      }
    } finally {
      release()
    }
  }
}

export const runPaidAiOperation = createPaidAiOperationRunner()
