import { Schema, model, models } from 'mongoose';

const ShortlistSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  scholarshipId: { type: Schema.Types.ObjectId, ref: 'Scholarship', required: true },
  status: { type: String, enum: ['saved', 'screening', 'preparing', 'ready_to_apply', 'applied'], default: 'saved' },
  matchScore: { type: Number },
  notifiedStages: [{ type: String, enum: ['30_days', '14_days', '7_days', '3_days'] }]
}, { timestamps: true });

const ChecklistSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  scholarshipId: { type: Schema.Types.ObjectId, ref: 'Scholarship', required: true },
  itemType: { type: String, required: true }, 
  isCompleted: { type: Boolean, default: false },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null }, 
  deadline: { type: Date }
}, { timestamps: true });

export const Shortlist = models.Shortlist || model('Shortlist', ShortlistSchema);
export const Checklist = models.Checklist || model('Checklist', ChecklistSchema);