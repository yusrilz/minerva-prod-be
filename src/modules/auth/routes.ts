import { Elysia, t } from 'elysia'
import { requireDatabase } from '../../db/mongo'
import { User } from '../../models/User'
import { UserProfile } from '../../models/UserProfile'
import { Transaction } from '../../models/Transaction'
import { AppError, assertFound } from '../../lib/errors'
import {
  createSessionToken,
  expiredSessionCookie,
  requireAuth,
  requireTrustedMutationOrigin,
  readRequestCookie,
  sessionCookie,
} from '../../auth/session'
import { config } from '../../config/env'
import { enforceAuthAttemptLimit, withArgon2Capacity } from './abuse-control'
import {
  assertGoogleConfigured,
  createOAuthStateToken,
  exchangeCodeForToken,
  fetchGoogleProfile,
  OAUTH_STATE_COOKIE,
  oauthStateCookie,
  readOAuthNext,
  googleAuthUrl,
} from './google'
import { assertEmailConfigured, createResetToken, sendPasswordResetEmail, verifyResetToken } from './reset'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordPattern = /^(?=.*[A-Z])(?=.*\d).{8,128}$/
const demoTokenPacks = {
  starter: 10,
  momentum: 30,
  focus: 60,
} as const

const packDisplay: Record<string, { name: string; price: string; description: string; badge: string }> = {
  starter:  { name: 'Starter',  price: '$4.99',  description: 'A focused boost for one application.',    badge: '' },
  momentum: { name: 'Momentum', price: '$11.99', description: 'Great for an active application season.', badge: 'Most popular' },
  focus:    { name: 'Focus',    price: '$19.99', description: 'Extra support across several folders.',    badge: '' },
}

async function publicUser(user: { _id: unknown; email: string; role: 'user' | 'admin'; tokenBalance: number }) {
  const profile = await UserProfile.findOne({ userId: user._id }).lean()
  return {
    id: String(user._id),
    name: profile?.name ?? '',
    email: user.email,
    role: user.role,
    tokenBalance: user.tokenBalance,
    profileCompleted: Boolean(
      profile?.name &&
      profile.country &&
      profile.currentEducationLevel &&
      profile.targetEducationLevel &&
      profile.fieldOfStudy,
    ),
  }
}

export const authRoutes = new Elysia({ name: 'auth-routes' })
  .post(
    '/api/auth/register',
    async ({ request, server, body, set }) => {
      requireTrustedMutationOrigin(request)
      enforceAuthAttemptLimit(request, 'register', server?.requestIP(request)?.address)
      requireDatabase()
      const email = body.email.trim().toLowerCase()
      const name = body.name.trim()

      if (!emailPattern.test(email)) throw new AppError(422, 'INVALID_EMAIL', 'Enter a valid email address')
      if (name.length < 2) throw new AppError(422, 'INVALID_NAME', 'Name must contain at least two characters')
      if (!passwordPattern.test(body.password)) {
        throw new AppError(422, 'WEAK_PASSWORD', 'Password must contain 8+ characters, one uppercase letter, and one number')
      }
      if (await User.exists({ email })) throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email')

      const passwordHash = await withArgon2Capacity(() =>
        Bun.password.hash(body.password, { algorithm: 'argon2id' }),
      )
      const user = await User.create({ email, passwordHash, role: config.adminEmails.has(email) ? 'admin' : 'user' })
      try {
        await UserProfile.create({ userId: user._id, name })
      } catch (error) {
        await User.deleteOne({ _id: user._id })
        throw error
      }

      const token = await createSessionToken({ userId: String(user._id), role: user.role })
      set.headers['set-cookie'] = sessionCookie(token)
      set.status = 201
      return { user: await publicUser(user) }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 120 }),
        email: t.String({ minLength: 3, maxLength: 254 }),
        password: t.String({ minLength: 8, maxLength: 128 }),
      }),
    },
  )
  .post(
    '/api/auth/login',
    async ({ request, server, body, set }) => {
      requireTrustedMutationOrigin(request)
      enforceAuthAttemptLimit(request, 'login', server?.requestIP(request)?.address)
      requireDatabase()
      const email = body.email.trim().toLowerCase()
      const user = await User.findOne({ email }).select('+passwordHash')
      // Google-created users have no passwordHash; they must sign in via Google.
      const passwordHash = user?.passwordHash
      const passwordMatches = passwordHash
        ? await withArgon2Capacity(() => Bun.password.verify(body.password, passwordHash))
        : false
      if (!user || !passwordMatches) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
      }

      if (config.adminEmails.has(email) && user.role !== 'admin') {
        user.role = 'admin'
        await user.save()
      }

      const ttl = body.remember === false ? 60 * 60 * 24 : config.sessionTtlSeconds
      const token = await createSessionToken({ userId: String(user._id), role: user.role }, ttl)
      set.headers['set-cookie'] = sessionCookie(token, ttl)
      return { user: await publicUser(user) }
    },
    {
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 254 }),
        password: t.String({ minLength: 1, maxLength: 128 }),
        remember: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    '/api/billing/demo-topups',
    async ({ request, body }) => {
      requireTrustedMutationOrigin(request)
      requireDatabase()
      const { userId } = await requireAuth(request)
      const tokens = demoTokenPacks[body.packId]
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { tokenBalance: tokens } },
        { new: true },
      )
      assertFound(user, 'Account not found')
      try {
        const transaction = await Transaction.create({
          userId,
          amount: tokens,
          type: 'topup',
          paymentMethod: 'credit_card',
          status: 'success',
        })
        return {
          demo: true,
          creditedTokens: tokens,
          tokenBalance: user.tokenBalance,
          transactionId: String(transaction._id),
        }
      } catch (error) {
        await User.updateOne({ _id: userId }, { $inc: { tokenBalance: -tokens } })
        throw error
      }
    },
    { body: t.Object({ packId: t.Union([t.Literal('starter'), t.Literal('momentum'), t.Literal('focus')]) }) },
  ).post('/api/auth/logout', async ({ request, set }) => {
    await requireAuth(request)
    set.headers['set-cookie'] = expiredSessionCookie()
    return { success: true as const }
  })
  .get('/api/pricing/packs', async () => {
    requireDatabase()
    const packs = (Object.keys(demoTokenPacks) as Array<keyof typeof demoTokenPacks>).map((id) => ({
      id,
      name: packDisplay[id].name,
      tokens: demoTokenPacks[id],
      price: packDisplay[id].price,
      description: packDisplay[id].description,
      badge: packDisplay[id].badge,
    }))
    return { packs }
  })
  .get('/api/auth/google', async ({ query, set }) => {
    requireDatabase()
    assertGoogleConfigured()
    const next = typeof query.next === 'string' && /^\/(?!\/)/.test(query.next) ? query.next : ''
    const state = await createOAuthStateToken(next)
    set.headers['set-cookie'] = oauthStateCookie(state)
    set.status = 302
    set.headers['location'] = googleAuthUrl(state)
  })
  .get('/api/auth/google/callback', async ({ request, query, set }) => {
    requireDatabase()
    if (query.error) {
      set.status = 302
      set.headers['location'] = `${config.frontendOrigin}/login?error=google_denied`
      return
    }
    const state = typeof query.state === 'string' ? query.state : ''
    const stateCookie = readRequestCookie(request, OAUTH_STATE_COOKIE)
    if (!state || !stateCookie || state !== stateCookie) {
      throw new AppError(400, 'INVALID_OAUTH_STATE', 'The OAuth request is invalid or has expired')
    }
    if (typeof query.code !== 'string' || !query.code) {
      throw new AppError(400, 'MISSING_OAUTH_CODE', 'Google did not return an authorization code')
    }
    const accessToken = await exchangeCodeForToken(query.code)
    const profile = await fetchGoogleProfile(accessToken)
    const email = profile.email.trim().toLowerCase()

    let user = await User.findOne({ email })
    if (!user) {
      user = await User.create({ email, role: config.adminEmails.has(email) ? 'admin' : 'user' })
      try {
        const base = (profile.name || email.split('@')[0] || '').trim()
        await UserProfile.create({ userId: user._id, name: base.length >= 2 ? base.slice(0, 120) : 'Scholar' })
      } catch (error) {
        await User.deleteOne({ _id: user._id })
        throw error
      }
    }

    if (config.adminEmails.has(email) && user.role !== 'admin') {
      user.role = 'admin'
      await user.save()
    }

    const token = await createSessionToken({ userId: String(user._id), role: user.role })
    // ponytail: the state cookie expires itself in 10 minutes; no need to clear it here.
    set.headers['set-cookie'] = sessionCookie(token)
    const next = await readOAuthNext(state)
    set.status = 302
    set.headers['location'] = `${config.frontendOrigin}/oauth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
  })
  .get('/api/auth/me', async ({ request }) => {
    requireDatabase()
    const session = await requireAuth(request)
    const user = await User.findById(session.userId)
    assertFound(user, 'Account not found')
    return { user: await publicUser(user) }
  })
  .delete('/api/users/me', async ({ request, set }) => {
    requireDatabase()
    const session = await requireAuth(request)
    const user = await User.findById(session.userId)
    assertFound(user, 'Account not found')
    
    // this part is modified to ensure [GDPR data purge compliance by cascading hard deletes]
    const userId = user._id;
    const { UserProfile } = await import('../../models/UserProfile')
    const { AiChatThread, AiChatMessage, AiUsage, DocumentAiReview } = await import('../ai/models')
    const { Transaction } = await import('../../models/Transaction')
    const { Application } = await import('../../models/Application')
    const { Document } = await import('../../models/Document')
    const { AIReview } = await import('../../models/AIReview')
    const { ChecklistItem } = await import('../../models/ChecklistItem')
    const { Mentor } = await import('../../models/Mentor')
    const { Pipeline } = await import('../../models/Pipeline')
    const { IELTSSubmission, IeltsResult } = await import('../../models/IELTS')

    try {
      await Promise.all([
        UserProfile.deleteMany({ userId }),
        AiChatThread.deleteMany({ userId }),
        AiChatMessage.deleteMany({ userId }),
        AiUsage.deleteMany({ userId }),
        DocumentAiReview.deleteMany({ userId }),
        Transaction.deleteMany({ userId }),
        Application.deleteMany({ userId }),
        Document.deleteMany({ userId }),
        AIReview.deleteMany({ userId }),
        ChecklistItem.deleteMany({ userId }),
        Mentor.deleteMany({ userId }),
        Pipeline.deleteMany({ userId }),
        IELTSSubmission.deleteMany({ userId }),
        IeltsResult.deleteMany({ userId }),
        user.deleteOne()
      ])
    } catch (err: any) {
      console.error("DELETE ERROR STACK:", err?.stack || err);
      throw err;
    }

    set.headers['set-cookie'] = expiredSessionCookie()
    return { success: true as const }
  })
  .post(
    '/api/auth/forgot-password',
    async ({ request, server, body }) => {
      requireDatabase()
      requireTrustedMutationOrigin(request)
      enforceAuthAttemptLimit(request, 'forgot', server?.requestIP(request)?.address)
      assertEmailConfigured()
      const email = body.email.trim().toLowerCase()
      const user = await User.findOne({ email }).select('+passwordHash')
      // Only email accounts with a password; reply identically either way to avoid account enumeration.
      if (user?.passwordHash) {
        const token = await createResetToken(String(user._id))
        await sendPasswordResetEmail(email, `${config.frontendOrigin}/reset-password?token=${encodeURIComponent(token)}`)
      }
      return { success: true as const }
    },
    {
      body: t.Object({ email: t.String({ minLength: 3, maxLength: 254 }) }),
    },
  )
  .get('/api/auth/reset-password', async ({ query }) => {
    requireDatabase()
    const userId = await verifyResetToken(typeof query.token === 'string' ? query.token : '')
    if (!userId) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired')
    return { success: true as const }
  })
  .post(
    '/api/auth/reset-password',
    async ({ request, body }) => {
      requireDatabase()
      const userId = await verifyResetToken(body.token)
      if (!userId) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired')
      if (!passwordPattern.test(body.password)) {
        throw new AppError(422, 'WEAK_PASSWORD', 'Password must contain 8+ characters, one uppercase letter, and one number')
      }
      const user = await User.findById(userId).select('+passwordHash')
      // Google-only accounts have no password; a reset link must never mint one for them.
      if (!user?.passwordHash) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired')
      user.passwordHash = await withArgon2Capacity(() => Bun.password.hash(body.password, { algorithm: 'argon2id' }))
      await user.save()
      return { success: true as const }
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1, maxLength: 512 }),
        password: t.String({ minLength: 8, maxLength: 128 }),
      }),
    },
  )
