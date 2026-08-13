import { type InferSchemaType, type Model, Schema, model, models } from 'mongoose'

const ApplicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scholarshipId: { type: Schema.Types.ObjectId, ref: 'Scholarship', required: true, index: true },
    status: {
      type: String,
      enum: ['saved', 'preparing', 'ready', 'applied'],
      default: 'preparing',
      required: true,
      index: true,
    },
    notes: { type: String, default: '', maxlength: 20_000 },
  },
  { timestamps: true },
)

ApplicationSchema.index({ userId: 1, scholarshipId: 1 }, { unique: true })

type ApplicationShape = InferSchemaType<typeof ApplicationSchema>
export const Application =
  (models.Application as Model<ApplicationShape> | undefined) ||
  model<ApplicationShape>('Application', ApplicationSchema)
