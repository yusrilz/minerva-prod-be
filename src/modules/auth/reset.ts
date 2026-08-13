import { createSessionToken, verifySessionToken } from '../../auth/session'
import { config } from '../../config/env'
import { AppError } from '../../lib/errors'

const RESEND_API_URL = 'https://api.resend.com/emails'
const RESET_TTL_SECONDS = 30 * 60

export function assertEmailConfigured() {
  if (!config.resendApiKey || !config.resendFrom) {
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email sending is not configured')
  }
}

// ponytail: reuse the session HMAC as a stateless reset nonce; userId rides in a `reset:` prefix.
export function createResetToken(userId: string): Promise<string> {
  return createSessionToken({ userId: `reset:${userId}`, role: 'user' }, RESET_TTL_SECONDS)
}

export async function verifyResetToken(token: string): Promise<string | null> {
  const session = await verifySessionToken(token)
  if (!session || !session.userId.startsWith('reset:')) return null
  return session.userId.slice(6) || null
}

function resetEmailHtml(resetUrl: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4fb;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px">
      <div style="background:#5b45f5;border-radius:16px 16px 0 0;padding:20px 24px">
        <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.5px">Minerva</span>
      </div>
      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px 24px">
        <h1 style="margin:0;font-size:22px;color:#17136b">Reset your password</h1>
        <p style="margin:16px 0 0;color:#64748b;font-size:15px;line-height:1.6">Click the button below to set a new password for your Minerva account. This link expires in 30 minutes.</p>
        <p style="margin:28px 0;text-align:center">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;border-radius:13px;background:#5b45f5;color:#ffffff;font-weight:800;font-size:15px;text-decoration:none">Reset password</a>
        </p>
        <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.6">If the button doesn't work, copy this link into your browser:<br><a href="${resetUrl}" style="color:#5b45f5">${resetUrl}</a></p>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    </div></body></html>`
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [email],
      subject: 'Reset your Minerva password',
      html: resetEmailHtml(resetUrl),
    }),
  })
  if (!response.ok) {
    throw new AppError(503, 'EMAIL_SEND_FAILED', 'The reset email could not be sent. Please try again.')
  }
}