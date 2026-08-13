import { type InferSchemaType, type Model, Schema, model, models } from 'mongoose'
import crypto from 'crypto'

// this part is modified to ensure [Field-Level Encryption for sensitive PII like phoneNumber]
export function encryptField(text: string | null): string | null {
  if (!text) return text;
  const keyStr = process.env.FLE_ENCRYPTION_KEY;
  if (!keyStr || keyStr.length !== 64) return text; 
  try {
    const key = Buffer.from(keyStr, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    return text;
  }
}

export function decryptField(text: string | null): string | null {
  if (!text || !text.includes(':')) return text;
  const keyStr = process.env.FLE_ENCRYPTION_KEY;
  if (!keyStr || keyStr.length !== 64) return text;
  try {
    const key = Buffer.from(keyStr, 'hex');
    const parts = text.split(':');
    if (parts.length !== 3) return text;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return text;
  }
}

const LanguageCertificateSchema = new Schema(
  {
    type: { type: String, required: true, trim: true },
    score: { type: String, required: true, trim: true },
  },
  { _id: false },
)

const UserProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true, required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    phoneNumber: { type: String, trim: true, default: null, set: encryptField, get: decryptField },
    age: { type: Number, min: 13, max: 120, default: null },
    country: { type: String, trim: true, default: '' },
    destinationCountry: { type: String, trim: true, default: 'South Korea' },
    currentEducationLevel: { type: String, trim: true, default: '' },
    targetEducationLevel: {
      type: String,
      enum: ['', 'Bachelor', 'Master', 'Doctorate', 'Postgraduate'],
      default: '',
    },
    gpa: { type: Number, default: null, min: 0 },
    gpaScale: { type: Number, default: 4, min: 1, max: 100 },
    fieldOfStudy: { type: String, trim: true, default: '' },
    scholarshipType: { type: String, trim: true, default: '' },
    fundingPreference: { type: String, trim: true, default: '' },
    englishLevel: { type: String, trim: true, default: '' },
    ieltsScore: { type: Number, default: null, min: 0, max: 9 },
    toeflScore: { type: Number, default: null, min: 0, max: 120 },
    topikScore: { type: Number, default: null, min: 0, max: 6 },
    languageCertificate: { type: String, trim: true, default: '' },
    languageScore: { type: String, trim: true, default: '' },
    languageCertificates: { type: [LanguageCertificateSchema], default: [] },
    availableDocuments: { type: [String], default: [] },
    workExperienceYears: { type: Number, default: 0, min: 0, max: 80 },
    enrollmentYear: { type: Number, default: null, min: 2000, max: 2200 },
    emailNotificationsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

UserProfileSchema.set('toJSON', {
  virtuals: true,
  getters: true,
  transform: (_document, result) => {
    const value = result as Record<string, unknown>
    delete value._id
    delete value.__v
    delete value.userId
    return result
  },
})

type UserProfileShape = InferSchemaType<typeof UserProfileSchema>
export const UserProfile =
  (models.UserProfile as Model<UserProfileShape> | undefined) ||
  model<UserProfileShape>('UserProfile', UserProfileSchema)
