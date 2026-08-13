import { type InferSchemaType, type Model, Schema, model, models } from 'mongoose'

const UploadSchema = new Schema(
  {
    originalName: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const DocumentPageSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 120 },
    title: { type: String, required: true, maxlength: 160 },
    contentHtml: { type: String, default: '', maxlength: 1_000_000 },
    contentText: { type: String, default: '', maxlength: 500_000 },
  },
  { _id: false },
)
const documentKinds = [
  'cv',
  'essay',
  'personal',
  'purpose',
  'study',
  'research',
  'transcript',
  'recommendation',
  'passport',
  'certificate',
  'custom',
] as const

const DocumentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    blueprintKey: { type: String, trim: true, default: '' },
    kind: { type: String, enum: documentKinds, required: true, default: 'custom' },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, default: '', maxlength: 2_000 },
    category: { type: String, default: 'Other', maxlength: 120 },
    prompt: { type: String, default: '', maxlength: 10_000 },
    contentHtml: { type: String, default: '', maxlength: 1_000_000 },
    contentText: { type: String, default: '', maxlength: 500_000 },
    pages: { type: [DocumentPageSchema], default: [] },
    status: {
      type: String,
      enum: ['missing', 'draft', 'ready'],
      default: 'missing',
      required: true,
    },
    upload: { type: UploadSchema, default: null },
    activeVersionId: { type: Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)

DocumentSchema.index({ userId: 1, applicationId: 1, order: 1 })
DocumentSchema.index(
  { userId: 1, applicationId: 1, blueprintKey: 1 },
  { unique: true, partialFilterExpression: { blueprintKey: { $type: 'string', $ne: '' } } },
)

const DocumentVersionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 240 },
    contentHtml: { type: String, default: '', maxlength: 1_000_000 },
    contentText: { type: String, default: '', maxlength: 500_000 },
    pages: { type: [DocumentPageSchema], default: [] },
    source: {
      type: String,
      enum: ['manual', 'autosave', 'review', 'restore'],
      default: 'manual',
      required: true,
    },
  },
  { timestamps: true },
)

DocumentVersionSchema.index({ userId: 1, documentId: 1, createdAt: -1 })

type DocumentShape = InferSchemaType<typeof DocumentSchema>
type DocumentVersionShape = InferSchemaType<typeof DocumentVersionSchema>

export const Document =
  (models.Document as Model<DocumentShape> | undefined) ||
  model<DocumentShape>('Document', DocumentSchema)
export const DocumentVersion =
  (models.DocumentVersion as Model<DocumentVersionShape> | undefined) ||
  model<DocumentVersionShape>('DocumentVersion', DocumentVersionSchema)
export { documentKinds }
