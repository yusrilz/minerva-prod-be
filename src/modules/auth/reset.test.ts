import { describe, expect, it } from 'bun:test'
import { createResetToken, verifyResetToken } from './reset'
import { createSessionToken } from '../../auth/session'

describe('password reset tokens', () => {
  it('round-trips the user id through a signed reset token', async () => {
    const token = await createResetToken('507f1f77bcf86cd799439011')
    expect(await verifyResetToken(token)).toBe('507f1f77bcf86cd799439011')
  })

  it('rejects tokens without a reset prefix', async () => {
    const unrelated = await createSessionToken({ userId: '507f1f77bcf86cd799439012', role: 'user' })
    expect(await verifyResetToken(unrelated)).toBeNull()
  })

  it('rejects tokens that have expired', async () => {
    const token = await createSessionToken({ userId: 'reset:507f1f77bcf86cd799439013', role: 'user' }, -1)
    expect(await verifyResetToken(token)).toBeNull()
  })

  it('rejects garbage and empty tokens', async () => {
    expect(await verifyResetToken('not-a-token')).toBeNull()
    expect(await verifyResetToken('')).toBeNull()
  })
})