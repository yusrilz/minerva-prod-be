import { describe, expect, it } from 'bun:test'
import {
  createOAuthStateToken,
  googleAuthUrl,
  OAUTH_STATE_COOKIE,
  oauthStateCookie,
  readOAuthNext,
} from './google'

describe('Google SSO helpers', () => {
  it('builds an auth URL carrying the state and required Google parameters', async () => {
    const state = await createOAuthStateToken('/dashboard')
    const url = new URL(googleAuthUrl(state))
    expect(url.searchParams.get('state')).toBe(state)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toContain('openid email profile')
    expect(url.searchParams.get('prompt')).toBe('select_account')
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/google/callback')
  })

  it('round-trips an internal next path through the signed state', async () => {
    expect(await readOAuthNext(await createOAuthStateToken('/mentors'))).toBe('/mentors')
    expect(await readOAuthNext(await createOAuthStateToken(''))).toBeNull()
    expect(await readOAuthNext(await createOAuthStateToken('https://evil.com'))).toBeNull()
  })

  it('issues a short-lived HttpOnly state cookie', () => {
    expect(oauthStateCookie('abc')).toContain(`${OAUTH_STATE_COOKIE}=abc`)
    expect(oauthStateCookie('abc')).toContain('HttpOnly')
    expect(oauthStateCookie('abc')).toContain('Max-Age=600')
  })
})