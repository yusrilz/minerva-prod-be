import { Schema, model, models } from 'mongoose';

const IELTSExerciseSchema = new Schema({
  setNumber: { type: Number, required: true },
  order: { type: Number, required: true },
  section: { type: String, enum: ['reading', 'listening', 'writing'], required: true },
  title: { type: String, required: true },
  instruction: { type: String},
  content: { type: String, required: true },
  graphUrl: { type: String },
  audioUrl: { type: String },
  questions: [{
    questionType: {
      type: String,
      enum: ['multiple_choice', 'fill_in_the_blank', 'true_false_not_given', 'matching', 'essay'],
      required: true
    },
    questionText: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: String, required: true },
    explanation: { type: String }
  }]
});

IELTSExerciseSchema.index({ setNumber: 1, order: 1 });

const IELTSSubmissionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  exerciseId: { type: Schema.Types.ObjectId, ref: 'IELTSExercise', required: true },
  answers: [{ type: String }],
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true }
}, { timestamps: true });

const IeltsResultSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  listeningScore: { type: Number, required: true, min: 0, max: 9 },
  readingScore: { type: Number, required: true, min: 0, max: 9 },
  writingScore: { type: Number, required: true, min: 0, max: 9 },
  speakingScore: { type: Number, required: true, min: 0, max: 9 },
  overallBand: { type: Number, required: true, min: 0, max: 9 },
  answers: { type: Schema.Types.Mixed }
}, { timestamps: true });

export const IELTSExercise = models.IELTSExercise || model('IELTSExercise', IELTSExerciseSchema);
export const IELTSSubmission = models.IELTSSubmission || model('IELTSSubmission', IELTSSubmissionSchema);
export const IeltsResult = models.IeltsResult || model('IeltsResult', IeltsResultSchema);
