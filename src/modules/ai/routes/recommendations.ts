import { Elysia, t } from 'elysia'
import { requireAuth } from '../../../auth/session'
import { AppError } from '../../../lib/errors'
import { Scholarship } from '../../../models/Scholarship'
import { baselineMatchScore } from '../../scholarships/routes'
import { UserProfile } from '../../../models/UserProfile'
import { AiRecommendationDaily } from '../models'
import { runPaidAiOperation } from '../paid-operation'
import type { AiRouteDependencies } from './shared'

const DAILY_RECOMMENDATION_LIMIT = 3
const CANDIDATE_LIMIT = 60

const jakartaDay = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

const reserveDailyRecommendation = async (userId: string, dayKey: string) => {
  const filter = { userId, dayKey, count: { $lt: DAILY_RECOMMENDATION_LIMIT } }
  try {
    return await AiRecommendationDaily.findOneAndUpdate(
      filter,
      { $inc: { count: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error
    return AiRecommendationDaily.findOneAndUpdate(filter, { $inc: { count: 1 } }, { new: true }).lean()
  }
}

type RecommendationCandidate = {
  id: string
  name: string
  country: string
  educationLevel: string
  fieldOfStudy: string
  fundingType: string
  deadline: string
  eligibility: string
  baselineMatch: number
}

const plain = (value: unknown) => {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(', ')
  return String(value).trim()
}

const asIsoDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

const candidateScore = (candidate: RecommendationCandidate, profile: Record<string, unknown> | null, answers: string[]) => {
  const intake = answers.join(' ').toLowerCase()
  let score = candidate.baselineMatch
  const addMatch = (profileValue: unknown, candidateValue: string, points: number) => {
    const preference = plain(profileValue).toLowerCase()
    if (preference && candidateValue.toLowerCase().includes(preference)) score += points
  }
  addMatch(profile?.destinationCountry, candidate.country, 8)
  addMatch(profile?.targetEducationLevel, candidate.educationLevel, 6)
  const field = plain(profile?.fieldOfStudy).toLowerCase()
  const candidateField = candidate.fieldOfStudy.toLowerCase()
  if (field && (candidateField.includes(field) || candidateField.includes('all field'))) score += 7
  addMatch(profile?.fundingPreference, candidate.fundingType, 5)
  if (intake.includes(candidate.country.toLowerCase())) score += 9
  if (candidateField && candidateField !== 'all fields' && intake.includes(candidateField)) score += 8
  if (/full(?:y)?\s+fund/.test(intake) && candidate.fundingType.toLowerCase().includes('full')) score += 7
  return score
}

const parseScholarshipIds = (text: string, allowed: Set<string>) => {
  const withoutFences = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const arrayText = withoutFences.match(/\[[\s\S]*?\]/)?.[0]
  if (!arrayText) return []
  try {
    const parsed = JSON.parse(arrayText)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map(plain).filter((id) => allowed.has(id)))]
  } catch {
    return []
  }
}

export const createRecommendationRoutes = ({ getAi }: AiRouteDependencies) =>
  new Elysia({ name: 'minerva-ai-recommendations' })
    .get('/api/ai/recommendations/status', async ({ request }) => {
      const { userId } = await requireAuth(request)
      const daily = await AiRecommendationDaily.findOne({ userId, dayKey: jakartaDay() }).lean()
      const usedToday = Math.min(DAILY_RECOMMENDATION_LIMIT, daily?.count || 0)
      return { dailyLimit: DAILY_RECOMMENDATION_LIMIT, usedToday, remainingToday: DAILY_RECOMMENDATION_LIMIT - usedToday }
    })
    .post('/api/ai/recommendations', async ({ request, body }) => {
      const { userId } = await requireAuth(request)
      const answers = body.answers.map((answer) => answer.trim()).filter(Boolean)
      if (answers.length < 1) throw new AppError(422, 'RECOMMENDATION_INPUT_INVALID', 'Tell Minerva at least one study preference before requesting recommendations.')

      const [scholarships, profile] = await Promise.all([
        Scholarship.find().sort({ featured: -1, deadline: 1 }).limit(CANDIDATE_LIMIT).lean(),
        UserProfile.findOne({ userId }).lean(),
      ])
      const candidates: RecommendationCandidate[] = scholarships.map((scholarship) => ({
        id: String(scholarship._id),
        name: plain(scholarship.name),
        country: plain(scholarship.country),
        educationLevel: plain(scholarship.educationLevel),
        fieldOfStudy: plain(scholarship.fieldOfStudy),
        fundingType: plain(scholarship.fundingType),
        deadline: asIsoDate(scholarship.deadline),
        eligibility: plain(scholarship.eligibilitySummary || scholarship.eligibilityRequirements).slice(0, 600),
        baselineMatch: baselineMatchScore(scholarship.baselineMatchPercentage),
      }))
      if (candidates.length < 3) throw new AppError(409, 'RECOMMENDATION_CATALOG_TOO_SMALL', 'At least three scholarships must exist in the Minerva catalog.')

      const fallbackIds = [...candidates]
        .sort((left, right) => candidateScore(right, profile as Record<string, unknown> | null, answers) - candidateScore(left, profile as Record<string, unknown> | null, answers))
        .map((candidate) => candidate.id)
      const allowed = new Set(fallbackIds)
      const dayKey = jakartaDay()

      const paid = await runPaidAiOperation(userId, async () => {
        const daily = await reserveDailyRecommendation(userId, dayKey)
        if (!daily) throw new AppError(429, 'RECOMMENDATION_DAILY_LIMIT_REACHED', 'You have used all 3 scholarship recommendation searches for today.')
        try {
          const profileContext = profile ? {
            country: profile.country,
            destinationCountry: profile.destinationCountry,
            targetEducationLevel: profile.targetEducationLevel,
            fieldOfStudy: profile.fieldOfStudy,
            fundingPreference: profile.fundingPreference,
            gpa: profile.gpa,
            ieltsScore: profile.ieltsScore,
            workExperienceYears: profile.workExperienceYears,
          } : {}
          const completion = await getAi().chat({
            messages: [{
              role: 'user',
              content: [
                'You are Minerva scholarship matching AI.',
                'Choose exactly 3 scholarship IDs from the supplied Minerva database candidates.',
                'Prioritize eligibility, study level, field, destination, funding preference, and deadline.',
                'Never invent an ID. Return only a JSON array of 3 ID strings, with no explanation.',
                `User profile: ${JSON.stringify(profileContext)}`,
                `Consultation answers: ${JSON.stringify(answers)}`,
                `Candidates: ${JSON.stringify(candidates.map(({ id, name, country, educationLevel, fieldOfStudy, fundingType, deadline, baselineMatch }) => ({
                  id, name, country, educationLevel, fieldOfStudy: fieldOfStudy.slice(0, 220), fundingType, deadline, baselineMatch,
                })))}`,
              ].join('\n'),
            }],
          }).catch((error) => {
            if (error instanceof AppError) throw error
            throw new AppError(502, 'RECOMMENDATION_AI_UNAVAILABLE', 'Minerva could not generate scholarship matches right now. Please try again.')
          })
          const aiIds = parseScholarshipIds(completion.text, allowed)
          const scholarshipIds = [...new Set([...aiIds, ...fallbackIds])].slice(0, 3)
          return { scholarshipIds, usedToday: daily.count }
        } catch (error) {
          await AiRecommendationDaily.updateOne({ userId, dayKey, count: { $gt: 0 } }, { $inc: { count: -1 } })
          throw error
        }
      })
      return {
        scholarshipIds: paid.value.scholarshipIds,
        dailyLimit: DAILY_RECOMMENDATION_LIMIT,
        usedToday: paid.value.usedToday,
        remainingToday: DAILY_RECOMMENDATION_LIMIT - paid.value.usedToday,
        tokenBalance: paid.tokenBalance,
      }
    }, {
      body: t.Object({ answers: t.Array(t.String({ minLength: 1, maxLength: 2_000 }), { minItems: 1, maxItems: 10 }) }),
    })
