import { Elysia, t } from 'elysia'
import { requireAuth } from '../../auth/session'
import { requireDatabase } from '../../db/mongo'
import { Application } from '../../models/Application'
import { ChecklistItem } from '../../models/ChecklistItem'
import { Document, DocumentVersion } from '../../models/Document'
import { DocumentAiReview } from '../ai/models'
import { applicationJson, ensureApplicationWorkspace, findOwnedApplication, resolveScholarshipId } from './service'
import { sendAddedReminder } from '../reminders/service'

const applicationStatus = t.Union([
  t.Literal('saved'),
  t.Literal('preparing'),
  t.Literal('ready'),
  t.Literal('applied'),
])

export const applicationRoutes = new Elysia({ name: 'application-routes' })
  .get(
    '/api/applications',
    async ({ request, query }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const filter: Record<string, unknown> = { userId }
      if (query.status) filter.status = query.status
      const applications = await Application.find(filter).populate('scholarshipId').sort({ updatedAt: -1 }).lean()
      return { applications: await Promise.all(applications.map((item) => applicationJson(item as Record<string, any>))) }
    },
    { query: t.Object({ status: t.Optional(t.String()) }) },
  )
  .post(
    '/api/applications',
    async ({ request, body, set }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const scholarship = await resolveScholarshipId(body.scholarshipId)
      const existing = await Application.findOne({ userId, scholarshipId: scholarship._id })
      const application = existing ?? await Application.create({
        userId,
        scholarshipId: scholarship._id,
        status: body.status ?? 'preparing',
        notes: body.notes?.trim() ?? '',
      })

      if (existing && (body.status !== undefined || body.notes !== undefined)) {
        if (body.status !== undefined) application.status = body.status
        if (body.notes !== undefined) application.notes = body.notes.trim()
        await application.save()
      }
      await ensureApplicationWorkspace(String(application._id), userId)
      await application.populate('scholarshipId')
      set.status = existing ? 200 : 201
      if (!existing) void sendAddedReminder(String(application._id), userId)
      return { application: await applicationJson(application.toObject() as Record<string, any>) }
    },
    {
      body: t.Object({
        scholarshipId: t.String({ minLength: 1, maxLength: 120 }),
        status: t.Optional(applicationStatus),
        notes: t.Optional(t.String({ maxLength: 20_000 })),
      }),
    },
  )
  .get('/api/applications/:id', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const application = await findOwnedApplication(params.id, userId)
    await application.populate('scholarshipId')
    return { application: await applicationJson(application.toObject() as Record<string, any>) }
  })
  .patch(
    '/api/applications/:id',
    async ({ request, params, body }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const application = await findOwnedApplication(params.id, userId)
      if (body.status !== undefined) application.status = body.status
      if (body.notes !== undefined) application.notes = body.notes.trim()
      await application.save()
      await application.populate('scholarshipId')
      return { application: await applicationJson(application.toObject() as Record<string, any>) }
    },
    {
      body: t.Object({
        status: t.Optional(applicationStatus),
        notes: t.Optional(t.String({ maxLength: 20_000 })),
      }),
    },
  )
  .delete('/api/applications/:id', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const application = await findOwnedApplication(params.id, userId)
    const documents = await Document.find({ userId, applicationId: application._id }).select('_id').lean()
    const documentIds = documents.map((document) => document._id)
    await DocumentAiReview.deleteMany({ userId, documentId: { $in: documentIds } })
    await DocumentVersion.deleteMany({ userId, documentId: { $in: documentIds } })
    await Document.deleteMany({ userId, applicationId: application._id })
    await ChecklistItem.deleteMany({ userId, applicationId: application._id })
    await application.deleteOne()
    return { success: true as const }
  })
