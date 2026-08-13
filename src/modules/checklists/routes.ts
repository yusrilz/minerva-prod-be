import { Elysia, t } from 'elysia'
import { Types } from 'mongoose'
import { requireAuth } from '../../auth/session'
import { requireDatabase } from '../../db/mongo'
import { AppError, assertFound } from '../../lib/errors'
import { ChecklistItem } from '../../models/ChecklistItem'
import { findOwnedApplication } from '../applications/service'

const checklistStatus = t.Union([
  t.Literal('pending'),
  t.Literal('in_progress'),
  t.Literal('done'),
])

function checklistJson(item: Record<string, any>) {
  return {
    id: String(item._id),
    key: item.itemKey || undefined,
    title: item.title,
    description: item.description ?? '',
    category: item.category ?? 'Other',
    required: item.required !== false,
    status: item.status,
    notes: item.notes ?? '',
    documentId: item.documentId ? String(item.documentId) : null,
    deadline: item.deadline ? new Date(item.deadline).toISOString() : null,
    order: item.order ?? 0,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
  }
}

async function findOwnedChecklistItem(itemId: string, userId: string) {
  if (!Types.ObjectId.isValid(itemId)) throw new AppError(400, 'INVALID_ID', 'Checklist item identifier is invalid')
  const item = await ChecklistItem.findOne({ _id: itemId, userId })
  assertFound(item, 'Checklist item not found')
  return item
}

export const checklistRoutes = new Elysia({ name: 'checklist-routes' })
  .get('/api/applications/:id/checklist', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const application = await findOwnedApplication(params.id, userId)
    const items = await ChecklistItem.find({ userId, applicationId: application._id }).sort({ order: 1, createdAt: 1 }).lean()
    return { items: items.map((item) => checklistJson(item as Record<string, any>)) }
  })
  .post(
    '/api/applications/:id/checklist',
    async ({ request, params, body, set }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const application = await findOwnedApplication(params.id, userId)
      const order = body.order ?? await ChecklistItem.countDocuments({ userId, applicationId: application._id })
      const item = await ChecklistItem.create({
        userId,
        applicationId: application._id,
        title: body.title.trim(),
        description: body.description?.trim() ?? '',
        category: body.category?.trim() || 'Other',
        required: body.required ?? true,
        status: body.status ?? 'pending',
        notes: body.notes?.trim() ?? '',
        deadline: body.deadline ? new Date(body.deadline) : null,
        order,
      })
      set.status = 201
      return { item: checklistJson(item.toObject() as Record<string, any>) }
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 240 }),
        description: t.Optional(t.String({ maxLength: 2_000 })),
        category: t.Optional(t.String({ maxLength: 120 })),
        required: t.Optional(t.Boolean()),
        status: t.Optional(checklistStatus),
        notes: t.Optional(t.String({ maxLength: 10_000 })),
        deadline: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
        order: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )
  .patch(
    '/api/checklist/:itemId',
    async ({ request, params, body }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const item = await findOwnedChecklistItem(params.itemId, userId)
      if (body.title !== undefined) item.title = body.title.trim()
      if (body.description !== undefined) item.description = body.description.trim()
      if (body.category !== undefined) item.category = body.category.trim()
      if (body.required !== undefined) item.required = body.required
      if (body.status !== undefined) item.status = body.status
      if (body.notes !== undefined) item.notes = body.notes.trim()
      if (body.deadline !== undefined) item.deadline = body.deadline ? new Date(body.deadline) : null
      if (body.order !== undefined) item.order = body.order
      await item.save()
      return { item: checklistJson(item.toObject() as Record<string, any>) }
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 240 })),
        description: t.Optional(t.String({ maxLength: 2_000 })),
        category: t.Optional(t.String({ maxLength: 120 })),
        required: t.Optional(t.Boolean()),
        status: t.Optional(checklistStatus),
        notes: t.Optional(t.String({ maxLength: 10_000 })),
        deadline: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
        order: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )
  .delete('/api/checklist/:itemId', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const item = await findOwnedChecklistItem(params.itemId, userId)
    await item.deleteOne()
    return { success: true as const }
  })

export { checklistJson }
