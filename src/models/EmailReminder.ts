import { type InferSchemaType, type Model, Schema, model, models } from 'mongoose'

const EmailReminderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    milestone: { type: String, enum: ['added', 'd30', 'd14', 'd7', 'd3'], required: true },
    sentAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true },
)

EmailReminderSchema.index({ applicationId: 1, milestone: 1 }, { unique: true })

type EmailReminderShape = InferSchemaType<typeof EmailReminderSchema>
export const EmailReminder =
  (models.EmailReminder as Model<EmailReminderShape> | undefined) ||
  model<EmailReminderShape>('EmailReminder', EmailReminderSchema)
