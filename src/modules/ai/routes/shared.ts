import { isValidObjectId } from 'mongoose'
import { Application } from '../../../models/Application'
import { Scholarship } from '../../../models/Scholarship'
import { UserProfile } from '../../../models/UserProfile'
import { AppError } from '../../../lib/errors'
import { AiError } from '../errors'
import type { MinervaAI, ProviderMetadata } from '../types'

export interface AiRouteDependencies {
  getAi: () => MinervaAI
}

export const throwRouteError = (error: unknown): never => {
  if (error instanceof AiError) {
    throw new AppError(error.status, error.code, error.message, {
      retryable: error.retryable,
    })
  }
  throw error
}

export const validateAudio = (audio: File): void => {
  const maximumBytes = Number(process.env.UPLOAD_MAX_BYTES) || 25_000_000
  if (!audio.size) {
    throw new AppError(422, 'EMPTY_AUDIO', 'The audio recording is empty')
  }
  if (audio.size > maximumBytes) {
    throw new AppError(413, 'AUDIO_TOO_LARGE', `Audio must be smaller than ${maximumBytes} bytes`)
  }
  const mimeType = audio.type.toLowerCase().split(';', 1)[0].trim()
  const supportedVideoContainers = new Set(['video/webm', 'video/mp4', 'video/ogg'])
  if (mimeType && !mimeType.startsWith('audio/') && !supportedVideoContainers.has(mimeType)) {
    throw new AppError(415, 'UNSUPPORTED_AUDIO_TYPE', 'Record with WebM, MP3, MP4, WAV, or OGG audio')
  }
}

export const clientMetadata = (metadata: ProviderMetadata) => ({
  model: metadata.model,
  requestId: metadata.requestId,
})

const plain = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export const resolveScholarship = async (identifier: string | undefined) => {
  const normalized = identifier?.trim()
  if (!normalized) return null
  const query = isValidObjectId(normalized)
    ? { _id: normalized }
    : { slug: normalized.toLowerCase() }
  return Scholarship.findOne(query).lean()
}

export const scholarshipContext = (scholarship: Record<string, unknown> | null): string => {
  if (!scholarship) return ''
  return [
    `Scholarship: ${plain(scholarship.name)}`,
    `Provider: ${plain(scholarship.provider)}`,
    `Country: ${plain(scholarship.country)}`,
    `University: ${plain(scholarship.university)}`,
    `Program: ${plain(scholarship.program)}`,
    `Education level: ${plain(scholarship.educationLevel)}`,
    `Field: ${plain(scholarship.fieldOfStudy)}`,
    `Funding: ${plain(scholarship.fundingType)}`,
    `Deadline: ${scholarship.deadline instanceof Date ? scholarship.deadline.toISOString() : plain(scholarship.deadline)}`,
    `Eligibility: ${plain(scholarship.eligibilitySummary || scholarship.eligibilityRequirements)}`,
    `Core values: ${Array.isArray(scholarship.coreValues) ? scholarship.coreValues.join(', ') : ''}`,
  ].filter((line) => !line.endsWith(': ')).join('\n')
}

export const buildChatContext = async (userId: string, applicationId?: string): Promise<string> => {
  const profile = await UserProfile.findOne({ userId }).lean() as Record<string, unknown> | null
  const lines: string[] = []

  if (profile) {
    lines.push(
      [
        'Authenticated user profile:',
        `Name: ${plain(profile.name)}`,
        `Home country: ${plain(profile.country)}`,
        `Target country: ${plain(profile.destinationCountry)}`,
        `Target education level: ${plain(profile.targetEducationLevel)}`,
        `Field of study: ${plain(profile.fieldOfStudy)}`,
        `Funding preference: ${plain(profile.fundingPreference)}`,
      ].join('\n'),
    )
  }

  if (applicationId) {
    if (!isValidObjectId(applicationId)) {
      throw new AppError(400, 'INVALID_APPLICATION_ID', 'The application identifier is invalid')
    }
    const application = await Application.findOne({ _id: applicationId, userId }).lean() as Record<string, unknown> | null
    if (!application) {
      throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found')
    }
    const scholarship = await Scholarship.findById(application.scholarshipId).lean() as Record<string, unknown> | null
    lines.push(
      [
        scholarshipContext(scholarship),
        `Application status: ${plain(application.status)}`,
        application.notes ? `Application notes: ${plain(application.notes).slice(0, 4_000)}` : '',
      ].filter(Boolean).join('\n'),
    )
  }

  return lines.join('\n\n').slice(0, 12_000)
}

export const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Buffer.from(digest).toString('hex')
}
