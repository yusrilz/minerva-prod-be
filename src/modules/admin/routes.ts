import { Elysia, t } from 'elysia'
import { Types } from 'mongoose'
import { requireAuth } from '../../auth/session'
import { requireDatabase } from '../../db/mongo'
import { AppError, assertFound } from '../../lib/errors'
import { Scholarship } from '../../models/Scholarship'
import { scholarshipJson } from '../scholarships/routes'

const scholarshipBody = t.Object({
  name: t.String({ minLength: 2, maxLength: 240 }),
  provider: t.String({ minLength: 2, maxLength: 240 }),
  country: t.String({ minLength: 2, maxLength: 120 }),
  university: t.String({ minLength: 2, maxLength: 240 }),
  program: t.String({ minLength: 2, maxLength: 240 }),
  educationLevel: t.String({ minLength: 2, maxLength: 120 }),
  fieldOfStudy: t.String({ minLength: 2, maxLength: 240 }),
  fundingType: t.String({ minLength: 2, maxLength: 120 }),
  scholarshipType: t.String({ minLength: 2, maxLength: 120 }),
  eligibilitySummary: t.String({ minLength: 2, maxLength: 4_000 }),
  eligibilityRequirements: t.Optional(t.String({ maxLength: 10_000 })),
  deadline: t.String({ minLength: 10, maxLength: 80 }),
  applicationUrl: t.String({ minLength: 8, maxLength: 2_000 }),
  requiredDocuments: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 180 }), { maxItems: 30 })),
  featured: t.Optional(t.Boolean()),
  baselineMatchPercentage: t.Optional(t.Number({ minimum: 0, maximum: 99 })),
  minGpa: t.Optional(t.Number({ minimum: 0, maximum: 4 })),
  minIeltsScore: t.Optional(t.Number({ minimum: 0, maximum: 9 })),
  minWorkExperienceYears: t.Optional(t.Number({ minimum: 0, maximum: 80 })),
  apostilleRequired: t.Optional(t.Boolean()),
  submissionMethod: t.Optional(t.String({ maxLength: 120 })),
  documentSubmissionGuidelines: t.Optional(t.String({ maxLength: 10_000 })),
  coreValues: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 180 }), { maxItems: 20 })),
})

type ScholarshipInput = typeof scholarshipBody.static

async function requireAdmin(request: Request) {
  const session = await requireAuth(request)
  if (session.role !== 'admin') throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required')
  return session
}

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || `scholarship-${crypto.randomUUID()}`
}

function normalizeInput(input: ScholarshipInput) {
  const deadline = new Date(input.deadline)
  if (Number.isNaN(deadline.getTime())) throw new AppError(422, 'INVALID_DEADLINE', 'Enter a valid scholarship deadline')
  try { new URL(input.applicationUrl) } catch { throw new AppError(422, 'INVALID_APPLICATION_URL', 'Enter a valid application URL') }
  return {
    ...input,
    deadline,
    requiredDocuments: input.requiredDocuments ?? [],
    featured: input.featured ?? false,
    baselineMatchPercentage: input.baselineMatchPercentage ?? 50,
    minGpa: input.minGpa ?? 0,
    minIeltsScore: input.minIeltsScore ?? 0,
    minWorkExperienceYears: input.minWorkExperienceYears ?? 0,
    apostilleRequired: input.apostilleRequired ?? false,
    submissionMethod: input.submissionMethod ?? 'online',
    documentSubmissionGuidelines: input.documentSubmissionGuidelines ?? '',
    coreValues: input.coreValues ?? [],
  }
}

export const adminRoutes = new Elysia({ name: 'admin-routes' })
  .get('/api/admin/scholarships', async ({ request }) => {
    requireDatabase()
    await requireAdmin(request)
    const scholarships = await Scholarship.find().sort({ updatedAt: -1, name: 1 }).lean()
    return { scholarships: scholarships.map((scholarship) => scholarshipJson(scholarship as Record<string, any>)) }
  })
  .post('/api/admin/scholarships', async ({ request, body, set }) => {
    requireDatabase()
    await requireAdmin(request)
    const normalized = normalizeInput(body)
    const baseSlug = slugify(normalized.name)
    let slug = baseSlug
    let suffix = 2
    while (await Scholarship.exists({ slug })) slug = `${baseSlug}-${suffix++}`
    const scholarship = await Scholarship.create({ ...normalized, slug })
    set.status = 201
    return { scholarship: scholarshipJson(scholarship.toObject() as Record<string, any>) }
  }, { body: scholarshipBody })
  .put('/api/admin/scholarships/:id', async ({ request, params, body }) => {
    requireDatabase()
    await requireAdmin(request)
    if (!Types.ObjectId.isValid(params.id)) throw new AppError(400, 'INVALID_ID', 'Scholarship identifier is invalid')
    const scholarship = await Scholarship.findById(params.id)
    assertFound(scholarship, 'Scholarship not found')
    scholarship.set(normalizeInput(body))
    await scholarship.save()
    return { scholarship: scholarshipJson(scholarship.toObject() as Record<string, any>) }
  }, { params: t.Object({ id: t.String() }), body: scholarshipBody })
  .delete('/api/admin/scholarships/:id', async ({ request, params }) => {
    requireDatabase()
    await requireAdmin(request)
    if (!Types.ObjectId.isValid(params.id)) throw new AppError(400, 'INVALID_ID', 'Scholarship identifier is invalid')
    const scholarship = await Scholarship.findByIdAndDelete(params.id)
    assertFound(scholarship, 'Scholarship not found')
    return { deleted: true, id: params.id }
  }, { params: t.Object({ id: t.String() }) })