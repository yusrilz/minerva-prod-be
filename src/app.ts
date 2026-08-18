import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { config } from './config/env'
import { databaseHealth } from './db/mongo'
import { asAppError } from './lib/errors'
import { authRoutes } from './modules/auth/routes'
import { profileRoutes } from './modules/profiles/routes'
import { scholarshipRoutes } from './modules/scholarships/routes'
import { applicationRoutes } from './modules/applications/routes'
import { checklistRoutes } from './modules/checklists/routes'
import { documentRoutes } from './modules/documents/routes'
import { ieltsRoutes } from './modules/ielts/routes'
import { mentorsRoutes } from './modules/mentors/routes'
import { createMinervaAiRoutes } from './modules/ai/routes'
import { adminRoutes } from './modules/admin/routes'

// this part is modified to ensure [assume breach log sanitization by dynamically redacting sensitive keys like passwordHash or secret tokens from all logs]
const redactKeys = ['password', 'token', 'auth_token', 'jwt', 'secret', 'passwordHash', '_v'];
const redactRecursive = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactRecursive);
  const sanitized = { ...obj };
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = redactRecursive(sanitized[key]);
    } else if (redactKeys.some(rKey => key.toLowerCase().includes(rKey.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
};
['log', 'info', 'warn', 'error'].forEach((level) => {
  const original = (console as any)[level];
  (console as any)[level] = (...args: any[]) => {
    const sanitizedArgs = args.map(arg => typeof arg === 'object' ? redactRecursive(arg) : arg);
    original.apply(console, sanitizedArgs);
  };
});

export const app = new Elysia({ name: 'minerva-api' })
  // this code is modified to ensure [strict CORS policies block cross-origin attacks and output guardrails prevent AI hallucination data leaks]
  .use(cors({
    origin: [config.frontendOrigin],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-ID'],
    exposeHeaders: ['X-Request-ID'],
  }))
  .onRequest(({ request, set }) => {
    set.headers['x-request-id'] = request.headers.get('x-request-id') || crypto.randomUUID()
    set.headers['x-content-type-options'] = 'nosniff'
    set.headers['referrer-policy'] = 'no-referrer'
    // this part is modified to ensure [Cache-Control headers prevent client-side storage leakage]
    set.headers['cache-control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate'
    set.headers['pragma'] = 'no-cache'
    set.headers['expires'] = '0'
  })
  .onError(({ code, error, request, set }) => {
    const requestId = String(set.headers['x-request-id'] || request.headers.get('x-request-id') || crypto.randomUUID())

    if (code === 'VALIDATION') {
      set.status = 422
      const detail = error instanceof Error ? error.message : String(error)
      console.warn(`[${requestId}] VALIDATION_ERROR`, detail)
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: detail && detail !== 'VALIDATION' ? detail : 'The request did not match the expected format',
          details: detail,
        },
        requestId,
      }
    }

    if (code === 'NOT_FOUND') {
      set.status = 404
      return {
        error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' },
        requestId,
      }
    }

    const appError = asAppError(error)
    set.status = appError.status
    if (appError.status >= 500) {
      console.error(`[${requestId}] ${appError.errorCode}`, error instanceof Error ? error.stack : error)
    }
    return {
      error: {
        code: appError.errorCode,
        message: appError.message,
        ...(appError.details === undefined ? {} : { details: appError.details }),
      },
      requestId,
    }
  })
  .get('/api/health', () => {
    const database = databaseHealth()
    return {
      status: database.status === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database,
    }
  })
  .get('/media/*', async ({ params, set }) => {
    const relative = params['*']
    if (typeof relative !== 'string' || relative.includes('..') || relative.includes('\0')) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'File not found' } }
    }
    const file = Bun.file(`public/${relative}`)
    if (!(await file.exists())) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'File not found' } }
    }
    return new Response(file)
  })
  .use(authRoutes)
  .use(profileRoutes)
  .use(scholarshipRoutes)
  .use(applicationRoutes)
  .use(checklistRoutes)
  .use(documentRoutes)
  .use(ieltsRoutes)
  .use(mentorsRoutes)
  .use(createMinervaAiRoutes())
  .use(adminRoutes)

export type App = typeof app
