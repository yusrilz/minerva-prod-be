import { type InferSchemaType, type Model, Schema, model, models } from 'mongoose'

const ChecklistItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    itemKey: { type: String, trim: true, default: '' },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, default: '', maxlength: 2_000 },
    category: { type: String, default: 'Other', maxlength: 120 },
    required: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'done'],
      default: 'pending',
      required: true,
    },
    notes: { type: String, default: '', maxlength: 10_000 },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    deadline: { type: Date, default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)

ChecklistItemSchema.index({ userId: 1, applicationId: 1, order: 1 })
ChecklistItemSchema.index(
  { userId: 1, applicationId: 1, itemKey: 1 },
  { unique: true, partialFilterExpression: { itemKey: { $type: 'string', $ne: '' } } },
)

type ChecklistItemShape = InferSchemaType<typeof ChecklistItemSchema>
export const ChecklistItem =
  (models.ChecklistItem as Model<ChecklistItemShape> | undefined) ||
  model<ChecklistItemShape>('ChecklistItem', ChecklistItemSchema)
