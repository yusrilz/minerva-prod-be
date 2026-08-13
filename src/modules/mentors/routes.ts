import { Elysia, t } from 'elysia'
import { Types } from 'mongoose'
import { requireAuth, requireTrustedMutationOrigin } from '../../auth/session'
import { requireDatabase } from '../../db/mongo'
import { AppError, assertFound } from '../../lib/errors'
import { Booking, Mentor, Transaction, User } from '../../models'

function parseIntoTokens(date: string, time: string): Date {
  const [hour = 0, minute = 0] = time.split(/\s*-\s*/)[0].replace('.', ':').split(':').map(Number)
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
}

export { parseIntoTokens }

async function bookingJson(booking: Record<string, any>) {
  const mentorDoc = booking.mentorId ? await Mentor.findById(booking.mentorId).lean() : null
  const mentor = mentorDoc as any
  return {
    id: String(booking._id),
    mentorId: String(booking.mentorId),
    mentorName: mentor?.name ?? 'Mentor',
    service: booking.service ?? '',
    date: booking.date ?? '',
    time: booking.time ?? '',
    notes: booking.notes ?? '',
    status: booking.status ?? 'pending',
  }
}

export const mentorsRoutes = new Elysia({ name: 'mentors-routes' })
  .get('/api/mentors', async ({ request }) => {
    requireDatabase()
    await requireAuth(request)
    const docs = (await Mentor.find().sort({ name: 1 }).lean()) as any[]
    return {
      mentors: docs.map((mentor) => ({
        id: String(mentor._id),
        name: mentor.name,
        avatarUrl: mentor.avatarUrl ?? null,
        expertise: mentor.expertise || [],
        scholarshipExperience: mentor.scholarshipExperience || [],
        availableDays: mentor.availableDays || [],
        availableTimeSlots: mentor.availableTimeSlots || [],
        priceInTokens: Number(mentor.priceInTokens ?? 0),
      })),
    }
  })
  .get('/api/bookings', async ({ request }) => {
    requireDatabase()
    const { userId } = await requireAuth(request)
    const bookings = await Booking.find({ userId }).sort({ dateTime: -1 }).lean()
    return { bookings: await Promise.all(bookings.map(bookingJson)) }
  })
  .post(
    '/api/mentors/:id/bookings',
    async ({ request, params, body }) => {
      requireDatabase()
      requireTrustedMutationOrigin(request)
      const { userId } = await requireAuth(request)
      if (!Types.ObjectId.isValid(params.id)) throw new AppError(400, 'INVALID_ID', 'Mentor identifier is invalid')
      const mentor = (await Mentor.findById(params.id).lean()) as any | null
      assertFound(mentor, 'Mentor not found')
      const price = Number(mentor.priceInTokens ?? 0)
      const user = await User.findOneAndUpdate(
        { _id: userId, tokenBalance: { $gte: price } },
        { $inc: { tokenBalance: -price } },
        { new: true },
      ).select('tokenBalance').lean()
      if (!user) {
        throw new AppError(402, 'TOKEN_BALANCE_DEPLETED', 'Your token balance is too low for this mentor session.', { tokenBalance: 0 })
      }
      let created = false
      try {
        const booking = await Booking.create({
          userId,
          mentorId: mentor._id,
          dateTime: parseIntoTokens(body.date, body.time),
          status: 'approved',
          tokensCharged: price,
          service: body.service,
          date: body.date,
          time: body.time,
          notes: body.notes,
        })
        await Transaction.create({ userId, amount: price, type: 'mentor_booking', status: 'success' })
        created = true
        return { booking: await bookingJson(booking.toObject()), tokenBalance: user.tokenBalance }
      } catch (error) {
        // refund on any persist failure so we never charge without a booking
        if (!created) await User.updateOne({ _id: userId }, { $inc: { tokenBalance: price } }).exec()
        throw error
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        service: t.String(),
        date: t.String(),
        time: t.String(),
        notes: t.Optional(t.String()),
      }),
    },
  )
  .delete(
    '/api/bookings/:id',
    async ({ request, params }) => {
      requireDatabase()
      requireTrustedMutationOrigin(request)
      const { userId } = await requireAuth(request)
      if (!Types.ObjectId.isValid(params.id)) throw new AppError(400, 'INVALID_ID', 'Booking identifier is invalid')
      const booking = await Booking.findOne({ _id: params.id, userId })
      assertFound(booking, 'Booking not found')
      const amount = Number(booking.tokensCharged ?? 0)
      // ponytail: refund = balance increment; the original mentor_booking transaction already records the spend
      const user = booking.status === 'pending' || booking.status === 'approved'
        ? await User.findByIdAndUpdate(userId, { $inc: { tokenBalance: amount } }, { new: true }).select('tokenBalance').lean()
        : null
      booking.status = 'cancelled'
      await booking.save()
      return { cancelled: true, ...(user ? { tokenBalance: user.tokenBalance } : {}) }
    },
    { params: t.Object({ id: t.String() }) },
  )