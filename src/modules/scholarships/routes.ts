import { Types } from 'mongoose'
import { Elysia, t } from 'elysia'
import { getAuthSession, requireAuth } from '../../auth/session'
import { requireDatabase } from '../../db/mongo'
import { AppError, assertFound } from '../../lib/errors'
import { Scholarship } from '../../models/Scholarship'
import { UserProfile } from '../../models/UserProfile'

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function baselineMatchScore(value: unknown) {
  const values = (Array.isArray(value) ? value : [value])
    .map(Number)
    .filter((score) => Number.isFinite(score))
  if (!values.length) return 50
  const average = values.reduce((total, score) => total + score, 0) / values.length
  return Math.max(0, Math.min(99, Math.round(average)))
}
function calculateMatch(scholarship: Record<string, any>, profile?: Record<string, any> | null) {
  if (!profile) {
    return {
      score: baselineMatchScore(scholarship.baselineMatchPercentage),
      reasons: ['Complete your profile for a personalized match'],
      gaps: [],
    }
  }

  let score = 45
  const reasons: string[] = []
  const gaps: string[] = []
  const targetLevel = String(profile.targetEducationLevel || '').toLowerCase()
  const scholarshipLevel = String(scholarship.educationLevel || '').toLowerCase()
  if (targetLevel && (scholarshipLevel.includes(targetLevel) || (targetLevel === 'doctorate' && scholarshipLevel === 'postgraduate'))) {
    score += 18
    reasons.push('Study level matches your target')
  } else if (targetLevel) {
    gaps.push('Study level may not match your target')
  }

  const field = String(profile.fieldOfStudy || '').toLowerCase()
  const scholarshipField = String(scholarship.fieldOfStudy || '').toLowerCase()
  if (field && (scholarshipField === 'all fields' || scholarshipField.includes(field) || field.includes(scholarshipField))) {
    score += 14
    reasons.push('Field of study is eligible')
  } else if (field) {
    gaps.push('Confirm that your field is eligible')
  }

  const destination = String(profile.destinationCountry || '').toLowerCase()
  if (destination && String(scholarship.country || '').toLowerCase().includes(destination)) {
    score += 9
    reasons.push('Destination matches your preference')
  }

  const funding = String(profile.fundingPreference || '').toLowerCase()
  if (funding && String(scholarship.fundingType || '').toLowerCase().includes(funding.replace('fully funded', 'fully'))) {
    score += 8
    reasons.push('Funding matches your preference')
  }

  if ((scholarship.minGpa ?? 0) > 0) {
    if ((profile.gpa ?? 0) >= scholarship.minGpa) {
      score += 3
      reasons.push('GPA meets the stated threshold')
    } else gaps.push('GPA is below the stated threshold')
  }
  if ((scholarship.minWorkExperienceYears ?? 0) > (profile.workExperienceYears ?? 0)) {
    score -= 8
    gaps.push('More work experience may be required')
  } else if ((scholarship.minWorkExperienceYears ?? 0) > 0) {
    score += 3
    reasons.push('Work experience meets the stated threshold')
  }

  return { score: Math.max(0, Math.min(99, Math.round(score))), reasons, gaps }
}

function scholarshipJson(scholarship: Record<string, any>, match?: ReturnType<typeof calculateMatch>) {
  return {
    id: String(scholarship._id),
    databaseId: String(scholarship._id),
    name: scholarship.name,
    provider: scholarship.provider,
    country: scholarship.country,
    university: scholarship.university,
    program: scholarship.program,
    educationLevel: scholarship.educationLevel,
    fieldOfStudy: scholarship.fieldOfStudy,
    fundingType: scholarship.fundingType,
    scholarshipType: scholarship.scholarshipType,
    eligibilitySummary: scholarship.eligibilitySummary,
    eligibilityRequirements: scholarship.eligibilityRequirements,
    deadline: new Date(scholarship.deadline).toISOString(),
    applicationUrl: scholarship.applicationUrl,
    requiredDocuments: scholarship.requiredDocuments,
    featured: scholarship.featured,
    matchPercentage: match?.score ?? baselineMatchScore(scholarship.baselineMatchPercentage),
    matchReasons: match?.reasons ?? [],
    matchGaps: match?.gaps ?? [],
    coreValues: scholarship.coreValues,
    apostilleRequired: scholarship.apostilleRequired,
    submissionMethod: scholarship.submissionMethod,
    documentSubmissionGuidelines: scholarship.documentSubmissionGuidelines,
  }
}

async function resolveScholarship(id: string) {
  // ponytail: _id-only lookup, old slug links break by design
  if (!Types.ObjectId.isValid(id)) throw new AppError(404, 'NOT_FOUND', 'Scholarship not found')
  const scholarship = await Scholarship.findOne({ _id: id }).lean()
  assertFound(scholarship, 'Scholarship not found')
  return scholarship as Record<string, any>
}

export const scholarshipRoutes = new Elysia({ name: 'scholarship-routes' })
  .get(
    '/api/scholarships',
    async ({ request, query }) => {
      requireDatabase()
      const filter: Record<string, unknown> = {}
      if (query.country) filter.country = query.country
      if (query.educationLevel) filter.educationLevel = query.educationLevel
      if (query.fundingType) filter.fundingType = query.fundingType
      if (query.featured === 'true') filter.featured = true
      if (query.q?.trim()) {
        const expression = new RegExp(escapeRegex(query.q.trim()), 'i')
        filter.$or = [
          { name: expression },
          { provider: expression },
          { country: expression },
          { fieldOfStudy: expression },
        ]
      }

      const page = Math.max(1, Number(query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50))
      const [items, total, session] = await Promise.all([
        Scholarship.find(filter).sort({ featured: -1, deadline: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        Scholarship.countDocuments(filter),
        getAuthSession(request),
      ])
      const profile = session ? await UserProfile.findOne({ userId: session.userId }).lean() : null
      const scholarships = items.map((item) => {
        const scholarship = item as unknown as Record<string, any>
        return scholarshipJson(scholarship, calculateMatch(scholarship, profile as Record<string, any> | null))
      })
      return { scholarships, total, page, pageSize }
    },
    {
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 200 })),
        country: t.Optional(t.String({ maxLength: 120 })),
        educationLevel: t.Optional(t.String({ maxLength: 120 })),
        fundingType: t.Optional(t.String({ maxLength: 120 })),
        featured: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
    },
  )
  .get('/api/scholarships/:id/match', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const [scholarship, profile] = await Promise.all([
      resolveScholarship(params.id),
      UserProfile.findOne({ userId }).lean(),
    ])
    if (!profile) throw new AppError(409, 'PROFILE_REQUIRED', 'Complete your profile to calculate a match')
    const match = calculateMatch(scholarship, profile as unknown as Record<string, any>)
    return { scholarshipId: String(scholarship._id), matchPercentage: match.score, reasons: match.reasons, gaps: match.gaps }
  })
  .get('/api/scholarships/:id', async ({ request, params }) => {
    requireDatabase()
    const [scholarship, session] = await Promise.all([resolveScholarship(params.id), getAuthSession(request)])
    const profile = session ? await UserProfile.findOne({ userId: session.userId }).lean() : null
    return { scholarship: scholarshipJson(scholarship, calculateMatch(scholarship, profile as Record<string, any> | null)) }
  })

export { baselineMatchScore, calculateMatch, scholarshipJson }
