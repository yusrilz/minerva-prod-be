import { Elysia, t } from 'elysia'
import { requireAuth } from '../../../auth/session'
import { AiUsage } from '../models'
import type { AiOperation } from '../types'

type UsageRecord = {
  _id: unknown
  operation: string
  provider: string
  model: string
  requestId?: string
  promptTokens: number
  completionTokens: number
  cachedPromptTokens: number
  audioSeconds?: number
  latencyMs: number
  status: 'completed' | 'failed'
  errorCode?: string
  createdAt: Date
}

export const createAiUsageRoutes = () =>
  new Elysia({ name: 'minerva-ai-usage' }).get(
    '/api/ai/usage',
    async ({ request, query }) => {
      const { userId } = await requireAuth(request)
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 30))
      const operations: AiOperation[] = [
        'chat',
        'document_review',
        'document_refine',
        'document_consult',
        'interview_questions',
        'interview_answer',
        'ielts_writing',
        'ielts_speaking',
        'transcription',
      ]
      const operation = operations.find((candidate) => candidate === query.operation)
      const records = await AiUsage.find({
        userId,
        ...(operation ? { operation } : {}),
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean() as unknown as UsageRecord[]

      return {
        records: records.map((record) => ({
          id: String(record._id),
          operation: record.operation,
          provider: record.provider,
          model: record.model,
          requestId: record.requestId,
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          cachedPromptTokens: record.cachedPromptTokens,
          audioSeconds: record.audioSeconds,
          latencyMs: record.latencyMs,
          status: record.status,
          errorCode: record.errorCode,
          createdAt: record.createdAt,
        })),
      }
    },
    {
      query: t.Object({
        operation: t.Optional(t.String({ maxLength: 100 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
    },
  )
