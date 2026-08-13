import { Elysia, t } from 'elysia'
import { requireAuth } from '../../auth/session'
import { requireDatabase } from '../../db/mongo'
import { UserProfile } from '../../models/UserProfile'
import { assertFound } from '../../lib/errors'

const numberLike = t.Union([t.Number(), t.String(), t.Null()])

function optionalNumber(value: number | string | null | undefined) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function profileJson(profile: InstanceType<typeof UserProfile>) {
  // this part is modified to ensure [API response scoping by omitting sensitive internal MongoDB fields like __v and _id from responses]
  const json = profile.toJSON();
  if ('__v' in json) delete json.__v;
  if ('_id' in json) delete json._id;
  return json;
}

export const profileRoutes = new Elysia({ name: 'profile-routes' })
  .get('/api/profile', async ({ request }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const profile = await UserProfile.findOne({ userId })
    assertFound(profile, 'Profile not found')
    return { profile: profileJson(profile) }
  })
  .put(
    '/api/profile',
    async ({ request, body }) => {
      requireDatabase()
      const { userId } = await requireAuth(request)
      const values = {
        ...body,
        name: body.name?.trim(),
        phoneNumber: body.phoneNumber?.trim(),
        age: optionalNumber(body.age),
        gpa: optionalNumber(body.gpa),
        gpaScale: optionalNumber(body.gpaScale),
        ieltsScore: optionalNumber(body.ieltsScore),
        toeflScore: optionalNumber(body.toeflScore),
        topikScore: optionalNumber(body.topikScore),
        workExperienceYears: optionalNumber(body.workExperienceYears),
        enrollmentYear: optionalNumber(body.enrollmentYear),
      }
      for (const key of Object.keys(values) as Array<keyof typeof values>) {
        if (values[key] === undefined) delete values[key]
      }

      const profile = await UserProfile.findOneAndUpdate(
        { userId },
        { $set: values, $setOnInsert: { userId } },
        { new: true, upsert: true, runValidators: true },
      )
      return { profile: profileJson(profile) }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2, maxLength: 120 })),
        phoneNumber: t.Optional(t.String({ maxLength: 50 })),
        age: t.Optional(numberLike),
        country: t.Optional(t.String({ maxLength: 120 })),
        destinationCountry: t.Optional(t.String({ maxLength: 120 })),
        currentEducationLevel: t.Optional(t.String({ maxLength: 120 })),
        targetEducationLevel: t.Optional(t.String({ maxLength: 120 })),
        gpa: t.Optional(numberLike),
        gpaScale: t.Optional(numberLike),
        fieldOfStudy: t.Optional(t.String({ maxLength: 240 })),
        scholarshipType: t.Optional(t.String({ maxLength: 120 })),
        fundingPreference: t.Optional(t.String({ maxLength: 120 })),
        englishLevel: t.Optional(t.String({ maxLength: 120 })),
        ieltsScore: t.Optional(numberLike),
        toeflScore: t.Optional(numberLike),
        topikScore: t.Optional(numberLike),
        languageCertificate: t.Optional(t.String({ maxLength: 120 })),
        languageScore: t.Optional(t.String({ maxLength: 120 })),
        languageCertificates: t.Optional(t.Array(t.Object({
          type: t.String({ maxLength: 120 }),
          score: t.String({ maxLength: 120 }),
        }), { maxItems: 20 })),
        availableDocuments: t.Optional(t.Array(t.String({ maxLength: 240 }), { maxItems: 100 })),
        workExperienceYears: t.Optional(numberLike),
        enrollmentYear: t.Optional(numberLike),
        emailNotificationsEnabled: t.Optional(t.Boolean()),
      }),
    },
  )
