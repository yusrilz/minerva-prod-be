import { GridFSBucket, ObjectId } from 'mongodb'
import mongoose from 'mongoose'
import { AppError } from './errors'

const BUCKET_NAME = 'document_uploads'

function requireBucket() {
  const db = mongoose.connection.db
  if (!db) throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is currently unavailable')
  return new GridFSBucket(db, { bucketName: BUCKET_NAME })
}

function asObjectId(storageKey: string) {
  if (!ObjectId.isValid(storageKey)) {
    throw new AppError(400, 'INVALID_UPLOAD_PATH', 'The stored document path is invalid')
  }
  return new ObjectId(storageKey)
}

export async function storeDocumentUpload(input: {
  file: File
  userId: string
  originalName: string
  mimeType: string
}) {
  const bucket = requireBucket()
  const buffer = Buffer.from(await input.file.arrayBuffer())
  const uploadStream = bucket.openUploadStream(input.originalName, {
    contentType: input.mimeType,
    metadata: {
      userId: input.userId,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: buffer.byteLength,
    },
  })

  await new Promise<void>((resolve, reject) => {
    uploadStream.on('error', reject)
    uploadStream.on('finish', () => resolve())
    uploadStream.end(buffer)
  })

  return {
    originalName: input.originalName.slice(0, 255),
    storageKey: String(uploadStream.id),
    mimeType: input.mimeType,
    size: buffer.byteLength,
  }
}

export async function readDocumentUpload(storageKey: string) {
  const bucket = requireBucket()
  const id = asObjectId(storageKey)
  const files = await bucket.find({ _id: id }).limit(1).toArray()
  if (!files.length) {
    throw new AppError(404, 'DOCUMENT_FILE_NOT_FOUND', 'The uploaded file is no longer available')
  }

  const chunks: Buffer[] = []
  const downloadStream = bucket.openDownloadStream(id)
  await new Promise<void>((resolve, reject) => {
    downloadStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    downloadStream.on('error', reject)
    downloadStream.on('end', () => resolve())
  })
  return Buffer.concat(chunks)
}

export async function removeDocumentUpload(storageKey?: string | null) {
  if (!storageKey) return
  if (!ObjectId.isValid(storageKey)) return
  const bucket = requireBucket()
  try {
    await bucket.delete(new ObjectId(storageKey))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return
    // GridFS delete throws when the file is already gone on some drivers.
    if (error instanceof Error && /FileNotFound|not found/i.test(error.message)) return
    throw error
  }
}
