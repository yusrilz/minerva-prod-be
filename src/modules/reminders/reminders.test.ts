import { describe, expect, it } from 'bun:test'
import { daysLeft, deadlineDate } from './service'

describe('daysLeft', () => {
  const now = new Date('2026-08-13T00:00:00.000Z')

  it('returns positive calendar days for a future deadline', () => {
    expect(daysLeft(new Date('2026-09-12T00:00:00.000Z'), now)).toBe(30)
    expect(daysLeft(new Date('2026-08-27T00:00:00.000Z'), now)).toBe(14)
  })

  it('counts a deadline later today as 0 or 1 day depending on remaining hours', () => {
    expect(daysLeft(new Date('2026-08-13T12:00:00.000Z'), new Date('2026-08-13T00:00:00.000Z'))).toBe(1)
  })

  it('returns negative for a past deadline', () => {
    expect(daysLeft(new Date('2026-08-01T00:00:00.000Z'), now)).toBe(-12)
  })
})

describe('deadlineDate', () => {
  it('parses a single date', () => {
    const date = deadlineDate('2026-09-12T00:00:00.000Z')
    expect(date?.toISOString()).toBe('2026-09-12T00:00:00.000Z')
  })

  it('picks the nearest future date from an array', () => {
    const date = deadlineDate([
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-15T00:00:00.000Z'),
    ])
    expect(date?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('returns null for an unparseable value', () => {
    expect(deadlineDate('not-a-date')).toBeNull()
  })
})