import { Schema, model, models } from 'mongoose';

const AIReviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document' }, 
  targetScholarshipId: { type: Schema.Types.ObjectId, ref: 'Scholarship' }, 
  essayText: { type: String }, 
  reviewType: { type: String, enum: ['cv', 'essay', 'personal_statement', 'study_plan'], required: true },
  score: { type: Number, default: 0 },
  feedback: {
    completeness: { type: String },
    formatting: { type: String },
    relevance: { type: String },
    grammar: { type: String },
    structure: { type: String },
    motivation: { type: String },
    coreValuesAlignment: { type: String },
    suggestedImprovements: { type: String }
  }
}, { timestamps: true });

export const AIReview = models.AIReview || model('AIReview', AIReviewSchema);