import { describe, expect, it } from 'bun:test'
import { parseIntoTokens } from './routes'

function parts(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

describe('parseIntoTokens', () => {
  it('parses a "HH.mm - HH.mm" range into the start time', () => {
    expect(parts(parseIntoTokens('2026-08-12', '09.00 - 09.30'))).toBe('2026-08-12 09:00:00')
  })

  it('handles a colon-based start time', () => {
    expect(parts(parseIntoTokens('2026-08-12', '14:30 - 15:00'))).toBe('2026-08-12 14:30:00')
  })
})