import { type InferSchemaType, type Model, Schema, model, models } from 'mongoose'

const ScholarshipSchema = new Schema(
  {
    slug: { type: Schema.Types.Mixed, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true },
    country: { type: Schema.Types.Mixed, required: true, index: true },
    university: { type: Schema.Types.Mixed, required: true },
    program: { type: Schema.Types.Mixed, required: true },
    educationLevel: { type: Schema.Types.Mixed, required: true, index: true },
    fieldOfStudy: { type: Schema.Types.Mixed, required: true, index: true },
    fundingType: { type: Schema.Types.Mixed, required: true, index: true },
    scholarshipType: { type: Schema.Types.Mixed, required: true },
    eligibilitySummary: { type: Schema.Types.Mixed, required: true },
    eligibilityRequirements: { type: String, default: '' },
    deadline: { type: Schema.Types.Mixed, required: true, index: true },
    applicationUrl: { type: Schema.Types.Mixed, required: true },
    requiredDocuments: { type: [String], default: [] },
    featured: { type: Schema.Types.Mixed, default: false, index: true },
    baselineMatchPercentage: { type: Schema.Types.Mixed, default: 50 },
    minGpa: { type: Number, default: 0, min: 0 },
    minIeltsScore: { type: Number, default: 0, min: 0, max: 9 },
    minToeflScore: { type: Number, default: 0, min: 0, max: 120 },
    minTopikScore: { type: Number, default: 0, min: 0, max: 6 },
    minWorkExperienceYears: { type: Schema.Types.Mixed, default: 0 },
    apostilleRequired: { type: Boolean, default: false },
    submissionMethod: { type: Schema.Types.Mixed, default: 'online' },
    documentSubmissionGuidelines: { type: String, default: '' },
    coreValues: { type: [String], default: [] },
  },
  { timestamps: true },
)

ScholarshipSchema.index({ name: 'text', provider: 'text', country: 'text', fieldOfStudy: 'text' })

type ScholarshipShape = InferSchemaType<typeof ScholarshipSchema>
export const Scholarship =
  (models.Scholarship as Model<ScholarshipShape> | undefined) ||
  model<ScholarshipShape>('Scholarship', ScholarshipSchema)
