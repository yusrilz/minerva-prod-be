import { Schema, model, models } from 'mongoose';

const TransactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, 
  type: { type: String, enum: ['topup', 'cv_review', 'essay_review', 'mentor_booking'], required: true },
  paymentMethod: { type: String, enum: ['bank_transfer', 'e_wallet', 'credit_card'], default: null },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'success' }
}, { timestamps: true });

export const Transaction = models.Transaction || model('Transaction', TransactionSchema);