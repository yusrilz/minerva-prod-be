import { Elysia, t } from 'elysia'
import { Types } from 'mongoose'
import { requireAuth, requireTrustedMutationOrigin } from '../../auth/session'
import { requireDatabase } from '../../db/mongo'
import { AppError, assertFound } from '../../lib/errors'
import { IELTSExercise, IELTSSubmission, User } from '../../models'
import { objectiveBand, scoreAnswers } from './scoring'

type IeltsSection = 'reading' | 'listening' | 'writing' | 'speaking'

type IeltsExercise = {
  id: string
  section: IeltsSection
  title: string
  instruction: string
  content: string
  graphUrl: string | null
  audioUrl: string | null
  order: number
  questions: Array<{ questionText: string; type: 'gap-fill' | 'mcq' | 'matching'; options: string[] }>
}

type IeltsSubmissionResult = {
  id: string
  exerciseId: string
  section: IeltsSection
  score: number
  totalQuestions: number
  estimatedBand: number
  feedback: string
  review: Array<{ question: string; yourAnswer: string; correctAnswer: string; explanation: string; isCorrect: boolean }>
}

function exerciseJson(exercise: Record<string, any>): IeltsExercise {
  return {
    id: String(exercise._id),
    section: exercise.section,
    title: exercise.title,
    instruction: exercise.instruction || '',
    content: exercise.content,
    graphUrl: exercise.graphUrl || null,
    audioUrl: exercise.audioUrl || null,
    order: exercise.order,
    questions: (exercise.questions || []).map((question: Record<string, any>) => ({
      questionText: question.questionText,
      // ponytail: DB stores questionType; true_false_not_given/essay intentionally fall back to free-text input
      type: ({ multiple_choice: 'mcq', matching: 'matching' } as Record<string, 'mcq' | 'matching'>)[question.questionType] || 'gap-fill',
      options: question.options || [],
    })),
  }
}

export const ieltsRoutes = new Elysia({ name: 'ielts-routes' })
  .get('/api/ielts/exercises/:id/audio', async ({ request, params }) => {
    requireDatabase()
    await requireAuth(request)
    if (!Types.ObjectId.isValid(params.id)) throw new AppError(400, 'INVALID_ID', 'Exercise identifier is invalid')
    const exercise = await IELTSExercise.findById(params.id).select('audioUrl').lean() as Record<string, any> | null
    assertFound(exercise, 'Exercise not found')
    const source = String(exercise.audioUrl || '')
    if (!source) throw new AppError(404, 'IELTS_AUDIO_NOT_FOUND', 'This exercise does not have an audio source')

    let sourceUrl: URL
    try { sourceUrl = new URL(source) } catch { throw new AppError(422, 'INVALID_IELTS_AUDIO_URL', 'The configured audio URL is invalid') }
    if (sourceUrl.protocol !== 'https:' || !['drive.google.com', 'drive.usercontent.google.com'].includes(sourceUrl.hostname)) {
      throw new AppError(422, 'UNSUPPORTED_IELTS_AUDIO_SOURCE', 'This exercise does not have a supported audio source')
    }

    const driveFileId = sourceUrl.hostname === 'drive.google.com'
      ? sourceUrl.pathname.match(/\/file\/d\/([^/]+)/)?.[1]
      : undefined
    if (driveFileId) sourceUrl = new URL(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`)

    let upstream: Response
    try {
      upstream = await fetch(sourceUrl, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    } catch {
      throw new AppError(502, 'IELTS_AUDIO_UNAVAILABLE', 'The audio source could not be reached')
    }
    if (!upstream.ok || !upstream.body) throw new AppError(502, 'IELTS_AUDIO_UNAVAILABLE', 'The audio source could not be played')
    const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
    if (!contentType.startsWith('audio/')) throw new AppError(502, 'IELTS_AUDIO_INVALID', 'The configured source did not return audio')
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': upstream.headers.get('content-length') || '',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
      },
    })
  })
  .get('/api/ielts/exercises/:id/graph', async ({ request, params }) => {
    requireDatabase()
    await requireAuth(request)
    if (!Types.ObjectId.isValid(params.id)) throw new AppError(400, 'INVALID_ID', 'Exercise identifier is invalid')
    const exercise = await IELTSExercise.findById(params.id).select('graphUrl').lean() as Record<string, any> | null
    assertFound(exercise, 'Exercise not found')
    const source = String(exercise.graphUrl || '')
    const fileId = source.match(/drive\.google\.com\/file\/d\/([^/?]+)/)?.[1]
    if (!fileId) throw new AppError(404, 'IELTS_GRAPH_NOT_FOUND', 'This writing exercise does not have a usable chart image')
    let upstream: Response
    try {
      upstream = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1800`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    } catch {
      throw new AppError(502, 'IELTS_GRAPH_UNAVAILABLE', 'The seeded chart image could not be reached')
    }
    if (!upstream.ok || !upstream.body) throw new AppError(502, 'IELTS_GRAPH_UNAVAILABLE', 'The seeded chart image could not be loaded')
    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) throw new AppError(502, 'IELTS_GRAPH_INVALID', 'The seeded chart did not return an image')
    return new Response(upstream.body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' } })
  })
  .get('/api/ielts/sets/:setNumber', async ({ request, params }) => {
    requireDatabase()
    await requireAuth(request)
    const setNumber = Number(params.setNumber)
    if (!Number.isInteger(setNumber) || setNumber < 1) {
      throw new AppError(400, 'INVALID_SET', 'Test set must be a positive integer')
    }
    const exercises = await IELTSExercise.find({ setNumber }).sort({ order: 1 }).lean()
    if (!exercises.length) throw new AppError(404, 'NOT_FOUND', 'Test set not found')
    return { set: { setNumber, exercises: exercises.map(exerciseJson) } }
  })
  .post(
    '/api/ielts/sets/:setNumber/submissions',
    async ({ request, params, body, set }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const setNumber = Number(params.setNumber)
      if (!Number.isInteger(setNumber) || setNumber < 1) {
        throw new AppError(400, 'INVALID_SET', 'Test set must be a positive integer')
      }
      const submissions = await Promise.all(
        body.exercises.map(async ({ exerciseId, answers }) => {
          const exercise = await IELTSExercise.findOne({ _id: exerciseId, setNumber }).lean() as Record<string, any> | null
          assertFound(exercise, 'Exercise not found')
          const { score, totalQuestions } = scoreAnswers(exercise.questions || [], answers)
          const estimatedBand = objectiveBand(score, totalQuestions)
          const record = await IELTSSubmission.create({
            userId,
            exerciseId,
            section: exercise.section,
            answers,
            score,
            totalQuestions,
          })
          const review = (exercise.questions || []).map((question: Record<string, any>, index: number) => {
            const yourAnswer = String(answers[index] ?? '').trim()
            const correctAnswer = String(question.correctAnswer ?? '').trim()
            return {
              question: String(question.questionText ?? `Question ${index + 1}`),
              yourAnswer,
              correctAnswer,
              explanation: String(question.explanation ?? ''),
              isCorrect: yourAnswer.toLowerCase() === correctAnswer.toLowerCase(),
            }
          })
          const submission: IeltsSubmissionResult = {
            id: String(record._id),
            exerciseId,
            section: exercise.section,
            score,
            totalQuestions,
            estimatedBand,
            feedback: `${score}/${totalQuestions} correct. Estimated practice band ${estimatedBand}; this is not an official IELTS result.`,
            review,
          }
          return submission
        }),
      )
const skillBands = (['listening', 'reading'] as const).flatMap((section) => {
        const items = submissions.filter((submission) => submission.section === section)
        if (!items.length) return []
        const score = items.reduce((total, submission) => total + submission.score, 0)
        const totalQuestions = items.reduce((total, submission) => total + submission.totalQuestions, 0)
        const estimatedBand = objectiveBand(score, totalQuestions)
        return [{ section, score, totalQuestions, estimatedBand, feedback: `${score}/${totalQuestions} correct across all ${section} parts. Estimated practice band ${estimatedBand}; this is not an official IELTS result.` }]
      })
      set.status = 201
      return { submissions, skillBands }
    },
    {
      body: t.Object({
        exercises: t.Array(
          t.Object({
            exerciseId: t.String({ minLength: 1 }),
            answers: t.Array(t.Union([t.String(), t.Number()])),
          }),
        ),
      }),
    },
  )
  .get(
    '/api/ielts/submissions',
    async ({ request, query }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 30))
      const items = await IELTSSubmission.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean()
      return {
        submissions: items.map((item) => ({
          id: String(item._id),
          exerciseId: String(item.exerciseId),
          section: item.section,
          score: item.score,
          totalQuestions: item.totalQuestions,
          estimatedBand: objectiveBand(item.score, item.totalQuestions),
          feedback: `${item.score}/${item.totalQuestions} correct.`,
          createdAt: item.createdAt,
        })),
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String({ pattern: '^\\d+$' })),
      }),
    },
  )
  .get('/api/ielts/progress', async ({ request }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const user = await User.findById(userId).lean()
    return {
      completedIeltsSimulationSets: user?.completedIeltsSimulationSets ?? [],
      ieltsPracticeResults: (user?.ieltsPracticeResults ?? []).map((item: Record<string, any>) => ({
        scholarshipId: String(item.scholarshipId || ''),
        type: String(item.type || ''),
        score: Number(item.score || 0),
        completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : new Date().toISOString(),
        explanation: String(item.explanation || ''),
      })),
    }
  })
  .put(
    '/api/ielts/progress',
    async ({ request, body }) => {
      requireDatabase()
      requireTrustedMutationOrigin(request)
      const { userId } = await requireAuth(request)
      const updated = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            completedIeltsSimulationSets: body.completedIeltsSimulationSets,
            ieltsPracticeResults: body.ieltsPracticeResults.map((item) => ({
              scholarshipId: item.scholarshipId || '',
              type: item.type,
              score: item.score,
              completedAt: item.completedAt ? new Date(item.completedAt) : new Date(),
              explanation: item.explanation || '',
            })),
          },
        },
        { new: true },
      ).lean()
      return {
        completedIeltsSimulationSets: updated?.completedIeltsSimulationSets ?? [],
        ieltsPracticeResults: (updated?.ieltsPracticeResults ?? []).map((item: Record<string, any>) => ({
          scholarshipId: String(item.scholarshipId || ''),
          type: String(item.type || ''),
          score: Number(item.score || 0),
          completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : new Date().toISOString(),
          explanation: String(item.explanation || ''),
        })),
      }
    },
    {
      body: t.Object({
        completedIeltsSimulationSets: t.Array(t.Number()),
        ieltsPracticeResults: t.Array(t.Object({
          scholarshipId: t.Optional(t.String()),
          type: t.String(),
          score: t.Number(),
          completedAt: t.String(),
          explanation: t.Optional(t.String()),
        })),
      }),
    },
  )
