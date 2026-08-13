import { Elysia } from 'elysia'
import { createMinervaAI } from './minerva-ai'
import type { MinervaAI } from './types'
import { createChatRoutes } from './routes/chat'
import { createDocumentReviewRoutes } from './routes/document-reviews'
import { createIeltsAiRoutes } from './routes/ielts'
import { createInterviewRoutes } from './routes/interviews'
import { createAiUsageRoutes } from './routes/usage'
import { createRecommendationRoutes } from './routes/recommendations'

export interface MinervaAiRouteOptions {
  ai?: MinervaAI
}

export const createMinervaAiRoutes = (options: MinervaAiRouteOptions = {}) => {
  let cachedAi = options.ai
  const dependencies = {
    getAi: (): MinervaAI => {
      cachedAi ??= createMinervaAI()
      return cachedAi
    },
  }

  return new Elysia({ name: 'minerva-ai-routes' })
    .use(createChatRoutes(dependencies))
    .use(createDocumentReviewRoutes(dependencies))
    .use(createInterviewRoutes(dependencies))
    .use(createIeltsAiRoutes(dependencies))
    .use(createRecommendationRoutes(dependencies))
    .use(createAiUsageRoutes())
}
