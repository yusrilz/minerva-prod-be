import { Document, DocumentVersion } from '../../models/Document'
import { AppError, assertFound } from '../../lib/errors'
import { sanitizeEditorHtml, stripHtml } from '../../lib/serialize'

export const DOCUMENT_VERSION_LIMIT = 50

export interface VersionInput {
  label?: string
  source?: 'manual' | 'autosave' | 'review' | 'restore'
}

export async function createDocumentVersion(documentId: string, userId: string, input: VersionInput = {}) {
  const document = await Document.findOne({ _id: documentId, userId })
  assertFound(document, 'Document not found')

  const count = await DocumentVersion.countDocuments({ documentId, userId })
  if (count >= DOCUMENT_VERSION_LIMIT) {
    throw new AppError(409, 'VERSION_LIMIT_REACHED', 'This document has reached the 50-version limit')
  }
  const version = await DocumentVersion.create({
    userId,
    documentId,
    label: input.label?.trim() || `Version ${count + 1}`,
    contentHtml: document.contentHtml,
    contentText: document.contentText,
    pages: document.pages,
    source: input.source ?? 'manual',
  })
  const storedCount = await DocumentVersion.countDocuments({ documentId, userId })
  if (storedCount > DOCUMENT_VERSION_LIMIT) {
    await version.deleteOne()
    throw new AppError(409, 'VERSION_LIMIT_REACHED', 'This document has reached the 50-version limit')
  }

  document.activeVersionId = version._id
  await document.save()
  return version
}

export async function restoreDocumentVersion(documentId: string, versionId: string, userId: string) {
  const [document, version] = await Promise.all([
    Document.findOne({ _id: documentId, userId }),
    DocumentVersion.findOne({ _id: versionId, documentId, userId }),
  ])
  assertFound(document, 'Document not found')
  assertFound(version, 'Document version not found')

  await createDocumentVersion(documentId, userId, {
    label: `Before restoring ${version.label}`,
    source: 'restore',
  })

  document.contentHtml = sanitizeEditorHtml(version.contentHtml)
  document.contentText = stripHtml(document.contentHtml)
  document.pages = version.pages || []
  document.status = version.contentText.trim() ? 'draft' : 'missing'
  const storedCount = await DocumentVersion.countDocuments({ documentId, userId })
  if (storedCount > DOCUMENT_VERSION_LIMIT) {
    await version.deleteOne()
    throw new AppError(409, 'VERSION_LIMIT_REACHED', 'This document has reached the 50-version limit')
  }

  document.activeVersionId = version._id
  await document.save()
  return document
}

export function normalizedDocumentContent(contentHtml?: string, contentText?: string) {
  if (contentHtml !== undefined && contentHtml.length > 1_000_000) {
    throw new AppError(413, 'DOCUMENT_TOO_LARGE', 'Document content exceeds the 1 MB limit')
  }

  const html = contentHtml === undefined ? undefined : sanitizeEditorHtml(contentHtml)
  return {
    contentHtml: html,
    contentText: html !== undefined ? stripHtml(html) : contentText?.trim(),
  }
}
