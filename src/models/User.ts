import { type InferSchemaType, type Model, Schema, model, models } from 'mongoose'

const UserSchema = new Schema(
  {
    email: { type: String, unique: true, required: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
    tokenBalance: { type: Number, default: 12, min: 0, required: true },
    // this part is modified to ensure [Account-Level Budgeting by tracking token consumption in MongoDB]
    dailyTokenUsage: { type: Number, default: 0, min: 0, required: true },
    dailyTokenResetAt: { type: Date, default: Date.now, required: true },
    completedIeltsSimulationSets: { type: [Number], default: [] },
    ieltsPracticeResults: {
      type: [
        new Schema(
          {
            scholarshipId: { type: String, default: '' },
            type: { type: String, default: '' },
            score: { type: Number, default: 0 },
            completedAt: { type: Date, default: null },
            explanation: { type: String, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
)

UserSchema.set('toJSON', {
  virtuals: true,
  transform: (_document, result) => {
    const value = result as Record<string, unknown>
    delete value._id
    delete value.__v
    delete value.passwordHash
    return result
  },
})

type UserShape = InferSchemaType<typeof UserSchema>
export const User = (models.User as Model<UserShape> | undefined) || model<UserShape>('User', UserSchema)
