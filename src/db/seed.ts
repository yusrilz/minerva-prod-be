import { scholarshipSeed } from '../data/scholarships'
import { ieltsSeed } from '../data/ielts'
import { mentorSeed } from '../data/mentors'
import { Scholarship } from '../models/Scholarship'
import { IELTSExercise } from '../models/IELTS'
import { Mentor } from '../models/Mentor'

export async function seedScholarships() {
  if (!scholarshipSeed.length) return
  await Scholarship.bulkWrite(
    scholarshipSeed.map((scholarship) => ({
      updateOne: {
        filter: { slug: scholarship.slug },
        update: { $set: scholarship },
        upsert: true,
      },
    })),
  )
}

export async function seedIelts() {
  if (!ieltsSeed.length) return
  await IELTSExercise.bulkWrite(
    ieltsSeed.map((exercise: (typeof ieltsSeed)[number]) => ({
      updateOne: {
        filter: { setNumber: exercise.setNumber, order: exercise.order },
        update: { $set: exercise },
        upsert: true,
      },
    })),
  )
}

export async function seedMentors() {
  if (!mentorSeed.length) return
  await Mentor.bulkWrite(
    mentorSeed.map((mentor) => ({
      updateOne: {
        filter: { name: mentor.name },
        update: { $set: mentor },
        upsert: true,
      },
    })),
  )
}
