import { Types } from 'mongoose'
import { Application } from '../../models/Application'
import { EmailReminder } from '../../models/EmailReminder'
import { Scholarship } from '../../models/Scholarship'
import { User } from '../../models/User'
import { UserProfile } from '../../models/UserProfile'
import { sendReminderEmail } from './email'

export const MILESTONES = [30, 14, 7, 3] as const
const DAY_MS = 86_400_000

export function daysLeft(deadline: Date, now: Date): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS)
}

export function deadlineDate(raw: unknown): Date | null {
  if (Array.isArray(raw)) {
    const future = raw
      .map((entry) => new Date(entry as string | number | Date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    return future[0] ?? null
  }
  const date = new Date(raw as string | number | Date)
  return Number.isNaN(date.getTime()) ? null : date
}

function firstUrl(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === 'string')
    return typeof first === 'string' ? first : ''
  }
  return ''
}

async function notificationsEnabled(userId: string): Promise<boolean> {
  const profile = await UserProfile.findOne({ userId }).lean()
  return profile ? profile.emailNotificationsEnabled !== false : true
}

async function claimSend(applicationId: string, userId: string, milestone: string): Promise<boolean> {
  try {
    await EmailReminder.create({ applicationId: new Types.ObjectId(applicationId), userId: new Types.ObjectId(userId), milestone })
    return true
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false
    throw error
  }
}

async function releaseClaim(applicationId: string, milestone: string): Promise<void> {
  await EmailReminder.deleteOne({ applicationId: new Types.ObjectId(applicationId), milestone })
}

export async function sendAddedReminder(applicationId: string, userId: string): Promise<void> {
  const application = await Application.findById(applicationId)
  if (!application) return
  const scholarship = await Scholarship.findById(application.scholarshipId).lean()
  const user = await User.findById(userId).lean()
  const deadline = deadlineDate(scholarship?.deadline)
  if (!scholarship || !user || !deadline) return
  if (!(await notificationsEnabled(userId))) return
  if (!(await claimSend(applicationId, userId, 'added'))) return

  try {
    await sendReminderEmail({
      email: user.email,
      scholarshipName: scholarship.name,
      provider: scholarship.provider,
      deadline,
      daysLeft: daysLeft(deadline, new Date()),
      applicationUrl: firstUrl(scholarship.applicationUrl),
      isConfirmation: true,
    })
  } catch (error) {
    await releaseClaim(applicationId, 'added')
    console.warn('[reminders] added email failed', error)
  }
}

export async function runMilestoneReminders(now = new Date()): Promise<void> {
  const applications = await Application.find({
    status: { $ne: 'applied' },
  })
    .select('userId scholarshipId status')
    .lean()

  for (const application of applications) {
    const scholarship = await Scholarship.findById(application.scholarshipId).select('name provider deadline applicationUrl').lean()
    const deadline = deadlineDate(scholarship?.deadline)
    if (!scholarship || !deadline || deadline.getTime() <= now.getTime()) continue

    const remaining = daysLeft(deadline, now)
    if (!(MILESTONES as readonly number[]).includes(remaining)) continue

    const user = await User.findById(application.userId).select('email').lean()
    if (!user || !(await notificationsEnabled(String(application.userId)))) continue

    const milestone = `d${remaining}`
    if (!(await claimSend(String(application._id), String(application.userId), milestone))) continue

    try {
      await sendReminderEmail({
        email: user.email,
        scholarshipName: scholarship.name,
        provider: scholarship.provider,
        deadline,
        daysLeft: remaining,
        applicationUrl: firstUrl(scholarship.applicationUrl),
        isConfirmation: false,
      })
    } catch (error) {
      await releaseClaim(String(application._id), milestone)
      console.warn(`[reminders] milestone ${milestone} email failed`, error)
    }
  }
}
