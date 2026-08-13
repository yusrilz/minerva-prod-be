import { describe, expect, it } from 'bun:test'
import { mentorSeed } from './mentors'

describe('mentor seeds', () => {
  it('provides 12 mentor seed entries shaped to the Mentor schema', () => {
    expect(mentorSeed).toHaveLength(12)

    for (const mentor of mentorSeed) {
      expect(mentor).toEqual(expect.objectContaining({
        name: expect.any(String),
        avatarUrl: expect.any(String),
        expertise: expect.any(Array),
        scholarshipExperience: expect.any(Array),
        availableDays: expect.any(Array),
        availableTimeSlots: expect.any(Array),
        priceInTokens: expect.any(Number),
      }))

      expect(mentor.expertise.length).toBeGreaterThan(0)
      expect(mentor.scholarshipExperience.length).toBeGreaterThan(0)
      expect(mentor.availableDays.length).toBeGreaterThan(0)
      expect(mentor.availableTimeSlots.length).toBeGreaterThan(0)
      expect(mentor.priceInTokens).toBeGreaterThan(0)
    }
  })
})
