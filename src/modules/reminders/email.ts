import { config } from '../../config/env'

const RESEND_API_URL = 'https://api.resend.com/emails'

export type ReminderEmailInput = {
  email: string
  scholarshipName: string
  provider: string
  deadline: Date
  daysLeft: number
  applicationUrl: string
  isConfirmation: boolean
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function reminderEmailHtml(input: ReminderEmailInput): string {
  const { scholarshipName, provider, deadline, daysLeft, applicationUrl, isConfirmation } = input
  const countdown =
    daysLeft <= 0
      ? 'The deadline has already passed.'
      : isConfirmation
        ? `This scholarship closes on <strong>${formatDate(deadline)}</strong> — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left to apply.`
        : `Only <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> left until the deadline on ${formatDate(deadline)}.`
  const subject = isConfirmation
    ? `${scholarshipName} saved to your applications`
    : `${scholarshipName} deadline in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
  const heading = isConfirmation
    ? 'Scholarship saved'
    : `${daysLeft} day${daysLeft === 1 ? '' : 's'} to go`

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4fb;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px">
      <div style="background:#5b45f5;border-radius:16px 16px 0 0;padding:20px 24px">
        <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.5px">Minerva</span>
      </div>
      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px 24px">
        <h1 style="margin:0;font-size:22px;color:#17136b">${heading}</h1>
        <p style="margin:16px 0 0;color:#64748b;font-size:15px;line-height:1.6">
          <strong style="color:#17136b">${scholarshipName}</strong> by ${provider}.
        </p>
        <p style="margin:12px 0 0;color:#64748b;font-size:15px;line-height:1.6">${countdown}</p>
        <p style="margin:28px 0;text-align:center">
          <a href="${applicationUrl}" style="display:inline-block;padding:14px 28px;border-radius:13px;background:#5b45f5;color:#ffffff;font-weight:800;font-size:15px;text-decoration:none">View application</a>
        </p>
        <p style="margin:24px 0 0;color:#94a3b8;font-size:12px">You received this because you enabled email notifications for your saved scholarships. You can turn these off anytime in your profile.</p>
      </div>
    </div></body></html>`
}

export async function sendReminderEmail(input: ReminderEmailInput): Promise<void> {
  if (!config.resendApiKey || !config.resendFrom) return
  const subject = input.isConfirmation
    ? `${input.scholarshipName} saved to your applications`
    : `${input.scholarshipName} deadline in ${input.daysLeft} day${input.daysLeft === 1 ? '' : 's'}`
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [input.email],
      subject,
      html: reminderEmailHtml(input),
    }),
  })
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}: ${await response.text()}`)
  }
}
