import { Elysia, t } from 'elysia'
import mammoth from 'mammoth'
import { Types } from 'mongoose'
import { requireAuth } from '../../auth/session'
import { config } from '../../config/env'
import { requireDatabase } from '../../db/mongo'
import { AppError, assertFound } from '../../lib/errors'
import { readDocumentUpload, removeDocumentUpload, storeDocumentUpload } from '../../lib/documentStorage'
import { sanitizeEditorHtml, stripHtml } from '../../lib/serialize'
import { Document, DocumentVersion } from '../../models/Document'
import { DocumentAiReview } from '../ai/models'
import { ensureApplicationWorkspace, findOwnedApplication } from '../applications/service'
import { createDocumentVersion, DOCUMENT_VERSION_LIMIT, normalizedDocumentContent, restoreDocumentVersion } from './service'

const documentKind = t.Union([
  t.Literal('cv'), t.Literal('essay'), t.Literal('personal'), t.Literal('purpose'),
  t.Literal('study'), t.Literal('research'), t.Literal('transcript'), t.Literal('recommendation'),
  t.Literal('passport'), t.Literal('certificate'), t.Literal('custom'),
])
const documentStatus = t.Union([t.Literal('missing'), t.Literal('draft'), t.Literal('ready')])
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const allowedUploadTypes = new Set([DOCX_MIME_TYPE])

async function persistUpload(file: File, userId: string) {
  if (!file.size) throw new AppError(422, 'EMPTY_DOCUMENT_UPLOAD', 'Choose a non-empty document file')
  if (file.size > config.uploadMaxBytes) {
    throw new AppError(413, 'DOCUMENT_UPLOAD_TOO_LARGE', `The document must be smaller than ${config.uploadMaxBytes} bytes`)
  }
  const mimeType = file.type.toLowerCase().split(';', 1)[0].trim()
  const isDocx = mimeType === DOCX_MIME_TYPE && file.name.toLowerCase().endsWith('.docx')
  if (!allowedUploadTypes.has(mimeType) || !isDocx) {
    throw new AppError(415, 'UNSUPPORTED_DOCUMENT_TYPE', 'Upload a DOCX document (.docx)')
  }
  return storeDocumentUpload({
    file,
    userId,
    originalName: file.name.slice(0, 255),
    mimeType,
  })
}

async function extractDocxContent(file: File) {
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await mammoth.convertToHtml({ buffer })
    const contentHtml = sanitizeEditorHtml(result.value)
    const contentText = stripHtml(contentHtml)
    if (!contentText.trim()) {
      throw new AppError(422, 'DOCX_HAS_NO_EDITABLE_TEXT', 'This DOCX does not contain editable text')
    }
    return { contentHtml, contentText }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(422, 'DOCX_READ_FAILED', 'Minerva could not read this DOCX file. Try saving it again as a standard Word document.')
  }
}

async function removeStoredUpload(upload: { storageKey?: string } | null | undefined) {
  if (!upload?.storageKey) return
  await removeDocumentUpload(upload.storageKey)
}

const documentPage = t.Object({
  id: t.String({ minLength: 1, maxLength: 120 }),
  title: t.String({ minLength: 1, maxLength: 160 }),
  content: t.Optional(t.String({ maxLength: 1_000_000 })),
  contentHtml: t.Optional(t.String({ maxLength: 1_000_000 })),
})

function normalizedPages(pages: Array<{ id: string; title: string; content?: string; contentHtml?: string }> | undefined) {
  if (!pages) return undefined
  return pages.slice(0, 30).map((page, index) => {
    const content = normalizedDocumentContent(page.contentHtml ?? page.content ?? '')
    return { id: page.id || `page-${index + 1}`, title: page.title.trim() || `Page ${index + 1}`, contentHtml: content.contentHtml || '', contentText: content.contentText || '' }
  })
}

function pagesJson(pages: unknown) {
  if (!Array.isArray(pages)) return []
  return pages.map((page, index) => {
    const value = page as Record<string, unknown>
    const contentHtml = sanitizeEditorHtml(String(value.contentHtml ?? ''))
    return { id: String(value.id || `page-${index + 1}`), title: String(value.title || `Page ${index + 1}`), content: contentHtml, contentHtml, contentText: stripHtml(contentHtml) }
  })
}

function versionJson(version: Record<string, any>) {
  const contentHtml = sanitizeEditorHtml(String(version.contentHtml ?? ''))
  return {
    id: String(version._id),
    label: version.label,
    content: version.contentHtml ?? '',
    contentHtml: version.contentHtml ?? '',
    contentText: version.contentText ?? '',
    pages: pagesJson(version.pages),
    source: version.source,
    createdAt: new Date(version.createdAt).toISOString(),
  }
}

function documentJson(document: Record<string, any>, versions: Record<string, any>[] = []) {
  const contentHtml = sanitizeEditorHtml(String(document.contentHtml ?? ''))
  return {
    id: String(document._id),
    applicationId: String(document.applicationId),
    key: document.blueprintKey || undefined,
    kind: document.kind,
    title: document.title,
    description: document.description ?? '',
    category: document.category ?? 'Other',
    prompt: document.prompt ?? '',
    content: document.contentHtml ?? '',
    contentHtml: document.contentHtml ?? '',
    contentText: document.contentText ?? '',
    pages: pagesJson(document.pages),
    uploadName: document.upload?.originalName ?? '',
    upload: document.upload ?? null,
    status: document.status,
    activeVersionId: document.activeVersionId ? String(document.activeVersionId) : null,
    order: document.order ?? 0,
    versions: versions.slice(0, DOCUMENT_VERSION_LIMIT).map(versionJson),
    createdAt: new Date(document.createdAt).toISOString(),
    updatedAt: new Date(document.updatedAt).toISOString(),
  }
}

async function findOwnedDocument(documentId: string, userId: string) {
  if (!Types.ObjectId.isValid(documentId)) throw new AppError(400, 'INVALID_ID', 'Document identifier is invalid')
  const document = await Document.findOne({ _id: documentId, userId })
  assertFound(document, 'Document not found')
  return document
}

async function loadVersions(documentId: unknown, userId: string) {
  return DocumentVersion.find({ documentId, userId }).sort({ createdAt: -1, _id: -1 }).limit(DOCUMENT_VERSION_LIMIT).lean()
}

export const documentRoutes = new Elysia({ name: 'document-routes' })
  .get('/api/applications/:id/documents', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const application = await findOwnedApplication(params.id, userId)
    await ensureApplicationWorkspace(String(application._id), userId)
    const documents = await Document.find({ userId, applicationId: application._id }).sort({ order: 1, createdAt: 1 }).lean()
    const versionEntries = await Promise.all(documents.map(async (document) => [
      String(document._id),
      await loadVersions(document._id, userId) as Record<string, any>[],
    ] as const))
    const versionsByDocument = new Map(versionEntries)
    return {
      documents: documents.map((document) => documentJson(
        document as Record<string, any>,
        versionsByDocument.get(String(document._id)) ?? [],
      )),
    }
  })
  .post(
    '/api/applications/:id/documents',
    async ({ request, params, body, set }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const application = await findOwnedApplication(params.id, userId)
      const content = normalizedDocumentContent(body.contentHtml ?? body.content, body.contentText)
      const order = body.order ?? await Document.countDocuments({ userId, applicationId: application._id })
      const document = await Document.create({
        userId,
        applicationId: application._id,
        kind: body.kind ?? 'custom',
        title: body.title.trim(),
        description: body.description?.trim() ?? '',
        category: body.category?.trim() || 'Other',
        prompt: body.prompt?.trim() ?? '',
        contentHtml: content.contentHtml ?? '',
        contentText: content.contentText ?? '',
        pages: normalizedPages(body.pages) ?? [],
        status: body.status ?? (content.contentText ? 'draft' : 'missing'),
        order,
      })
      set.status = 201
      return { document: documentJson(document.toObject() as Record<string, any>) }
    },
    {
      body: t.Object({
        kind: t.Optional(documentKind),
        title: t.String({ minLength: 1, maxLength: 240 }),
        description: t.Optional(t.String({ maxLength: 2_000 })),
        category: t.Optional(t.String({ maxLength: 120 })),
        prompt: t.Optional(t.String({ maxLength: 10_000 })),
        content: t.Optional(t.String({ maxLength: 1_000_000 })),
        contentHtml: t.Optional(t.String({ maxLength: 1_000_000 })),
        contentText: t.Optional(t.String({ maxLength: 500_000 })),
        pages: t.Optional(t.Array(documentPage, { maxItems: 30 })),
        status: t.Optional(documentStatus),
        order: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )
  .post(
    '/api/applications/:id/documents/upload',
    async ({ request, params, body, set }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const application = await findOwnedApplication(params.id, userId)
      const upload = await persistUpload(body.file, userId)
      try {
        const content = await extractDocxContent(body.file)
        const title = body.title?.trim() || upload.originalName.replace(/\.[^.]+$/, '') || 'Uploaded document'
        const order = await Document.countDocuments({ userId, applicationId: application._id })
        const document = await Document.create({
          userId,
          applicationId: application._id,
          kind: body.kind ?? 'custom',
          title: title.slice(0, 240),
          description: body.description?.trim() ?? '',
          category: body.category?.trim() || 'Other',
          contentHtml: content.contentHtml,
          contentText: content.contentText,
          pages: [{ id: 'page-1', title: 'Page 1', contentHtml: content.contentHtml, contentText: content.contentText }],
          upload,
          status: 'draft',
          order,
        })
        set.status = 201
        return { document: documentJson(document.toObject() as Record<string, any>) }
      } catch (error) {
        await removeStoredUpload(upload)
        throw error
      }
    },
    {
      body: t.Object({
        file: t.File(),
        kind: t.Optional(documentKind),
        title: t.Optional(t.String({ maxLength: 240 })),
        description: t.Optional(t.String({ maxLength: 2_000 })),
        category: t.Optional(t.String({ maxLength: 120 })),
      }),
    },
  )
  .get('/api/documents/:id', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const document = await findOwnedDocument(params.id, userId)
    const versions = await loadVersions(document._id, userId)
    return { document: documentJson(document.toObject() as Record<string, any>, versions as Record<string, any>[]) }
  })
  .get('/api/documents/:id/file', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const document = await findOwnedDocument(params.id, userId)
    if (!document.upload) throw new AppError(404, 'DOCUMENT_FILE_NOT_FOUND', 'This document does not have an uploaded file')
    const bytes = await readDocumentUpload(document.upload.storageKey)
    const filename = document.upload.originalName.replace(/[\r\n"]/g, '_')
    return new Response(bytes, {
      headers: {
        'Content-Type': document.upload.mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  })
  .patch(
    '/api/documents/:id',
    async ({ request, params, body }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const document = await findOwnedDocument(params.id, userId)
      if (body.title !== undefined) document.title = body.title.trim()
      if (body.description !== undefined) document.description = body.description.trim()
      if (body.category !== undefined) document.category = body.category.trim()
      if (body.prompt !== undefined) document.prompt = body.prompt.trim()
      if (body.kind !== undefined) document.kind = body.kind
      if (body.order !== undefined) document.order = body.order

      if (body.content !== undefined || body.contentHtml !== undefined || body.contentText !== undefined) {
        const content = normalizedDocumentContent(body.contentHtml ?? body.content, body.contentText)
        if (content.contentHtml !== undefined) document.contentHtml = content.contentHtml
        if (content.contentText !== undefined) document.contentText = content.contentText
        if (body.status === undefined) document.status = document.contentText.trim() ? 'draft' : 'missing'
      }
      if (body.pages !== undefined) document.pages = (normalizedPages(body.pages) ?? []) as any
      if (body.status !== undefined) document.status = body.status
      await document.save()
      const versions = await loadVersions(document._id, userId)
      return { document: documentJson(document.toObject() as Record<string, any>, versions as Record<string, any>[]) }
    },
    {
      body: t.Object({
        kind: t.Optional(documentKind),
        title: t.Optional(t.String({ minLength: 1, maxLength: 240 })),
        description: t.Optional(t.String({ maxLength: 2_000 })),
        category: t.Optional(t.String({ maxLength: 120 })),
        prompt: t.Optional(t.String({ maxLength: 10_000 })),
        content: t.Optional(t.String({ maxLength: 1_000_000 })),
        contentHtml: t.Optional(t.String({ maxLength: 1_000_000 })),
        contentText: t.Optional(t.String({ maxLength: 500_000 })),
        pages: t.Optional(t.Array(documentPage, { maxItems: 30 })),
        status: t.Optional(documentStatus),
        order: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )
  .delete('/api/documents/:id', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const document = await findOwnedDocument(params.id, userId)
    await DocumentAiReview.deleteMany({ userId, documentId: document._id })
    await DocumentVersion.deleteMany({ userId, documentId: document._id })
    await document.deleteOne()
    await removeStoredUpload(document.upload)
    return { success: true as const }
  })
  .get('/api/documents/:id/versions', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const document = await findOwnedDocument(params.id, userId)
    const versions = await loadVersions(document._id, userId)
    return { versions: versions.map((version) => versionJson(version as Record<string, any>)) }
  })
  .post(
    '/api/documents/:id/versions',
    async ({ request, params, body, set }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const version = await createDocumentVersion(params.id, userId, { label: body.label, source: body.source })
      set.status = 201
      return { version: versionJson(version.toObject() as Record<string, any>) }
    },
    {
      body: t.Object({
        label: t.Optional(t.String({ minLength: 1, maxLength: 240 })),
        source: t.Optional(t.Union([t.Literal('manual'), t.Literal('autosave'), t.Literal('review')])),
      }),
    },
  )
  .post('/api/documents/:id/versions/:versionId/restore', async ({ request, params }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const document = await restoreDocumentVersion(params.id, params.versionId, userId)
    const versions = await loadVersions(document._id, userId)
    return { document: documentJson(document.toObject() as Record<string, any>, versions as Record<string, any>[]) }
  })

export { documentJson, versionJson, findOwnedDocument }
