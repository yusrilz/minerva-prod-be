import { Schema, model, models } from 'mongoose';

const MentorSchema = new Schema({
  name: { type: String, required: true },
  avatarUrl: { type: String },
  expertise: [{ type: String }],
  scholarshipExperience: [{ type: String }], 
  availableDays: [{ type: String }], 
  availableTimeSlots: [{ type: String }], 
  priceInTokens: { type: Number, default: 10 }
});

const BookingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mentorId: { type: Schema.Types.ObjectId, ref: 'Mentor', required: true },
  dateTime: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'], default: 'pending' },
  tokensCharged: { type: Number, required: true },
  meetingLink: { type: String, default: null },
  service: { type: String, default: '' },
  date: { type: String, default: '' },
  time: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true });

export const Mentor = models.Mentor || model('Mentor', MentorSchema);
export const Booking = models.Booking || model('Booking', BookingSchema);