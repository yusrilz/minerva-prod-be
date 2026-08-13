import { Types } from 'mongoose'
import { AppError, assertFound } from '../../lib/errors'
import { Application } from '../../models/Application'
import { ChecklistItem } from '../../models/ChecklistItem'
import { Document } from '../../models/Document'
import { Scholarship } from '../../models/Scholarship'
import { defaultChecklistItems, defaultDocuments, obsoleteDocumentBlueprintKeys } from './defaults'
import { scholarshipJson } from '../scholarships/routes'

export async function findOwnedApplication(applicationId: string, userId: string) {
  if (!Types.ObjectId.isValid(applicationId)) throw new AppError(400, 'INVALID_ID', 'Application identifier is invalid')
  const application = await Application.findOne({ _id: applicationId, userId })
  assertFound(application, 'Application not found')
  return application
}

export async function resolveScholarshipId(identifier: string) {
  const query = Types.ObjectId.isValid(identifier)
    ? { $or: [{ _id: identifier }, { slug: identifier.toLowerCase() }] }
    : { slug: identifier.toLowerCase() }
  const scholarship = await Scholarship.findOne(query)
  assertFound(scholarship, 'Scholarship not found')
  return scholarship
}

export async function ensureApplicationWorkspace(applicationId: string, userId: string) {
  const userObjectId = new Types.ObjectId(userId)
  const applicationObjectId = new Types.ObjectId(applicationId)
  await Promise.all([
    ChecklistItem.bulkWrite(defaultChecklistItems.map((item) => ({
      updateOne: {
        filter: { userId: userObjectId, applicationId: applicationObjectId, itemKey: item.itemKey },
        update: { $setOnInsert: { ...item, userId: userObjectId, applicationId: applicationObjectId } },
        upsert: true,
      },
    }))),
    Document.bulkWrite(defaultDocuments.map((document) => ({
      updateOne: {
        filter: { userId: userObjectId, applicationId: applicationObjectId, blueprintKey: document.blueprintKey },
        update: { $setOnInsert: { ...document, userId: userObjectId, applicationId: applicationObjectId } },
        upsert: true,
      },
    }))),
  ])

  await Document.deleteMany({
    userId: userObjectId,
    applicationId: applicationObjectId,
    blueprintKey: { $in: [...obsoleteDocumentBlueprintKeys] },
    status: 'missing',
    $and: [
      {
        $or: [
          { contentText: { $in: [null, ''] } },
          { contentText: { $exists: false } },
        ],
      },
      {
        $or: [
          { contentHtml: { $in: [null, '', '<p></p>', '<p><br></p>'] } },
          { contentHtml: { $exists: false } },
        ],
      },
      {
        $or: [
          { upload: null },
          { upload: { $exists: false } },
          { 'upload.originalName': { $in: [null, ''] } },
        ],
      },
    ],
  })

  await ChecklistItem.deleteMany({
    userId: userObjectId,
    applicationId: applicationObjectId,
    itemKey: 'transcript',
    status: 'pending',
  })
}

export async function applicationJson(application: Record<string, any>) {
  const scholarshipRecord = application.scholarshipId && typeof application.scholarshipId === 'object' && 'slug' in application.scholarshipId
    ? application.scholarshipId
    : await Scholarship.findById(application.scholarshipId).lean()
  return {
    id: String(application._id),
    status: application.status,
    notes: application.notes ?? '',
    scholarshipId: String(scholarshipRecord?._id ?? application.scholarshipId),
    scholarship: scholarshipRecord ? scholarshipJson(scholarshipRecord as Record<string, any>) : null,
    createdAt: new Date(application.createdAt).toISOString(),
    updatedAt: new Date(application.updatedAt).toISOString(),
  }
}
