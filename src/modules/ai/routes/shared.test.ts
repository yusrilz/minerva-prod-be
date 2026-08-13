import { describe, expect, it } from 'bun:test'
import { validateAudio } from './shared'

const recording = (type: string) => new File(['recording'], 'recording.webm', { type })

describe('validateAudio', () => {
  it('accepts browser WebM and MP4 recording containers', () => {
    expect(() => validateAudio(recording('audio/webm;codecs=opus'))).not.toThrow()
    expect(() => validateAudio(recording('video/webm'))).not.toThrow()
    expect(() => validateAudio(recording('video/mp4'))).not.toThrow()
  })

  it('rejects unsupported file types', () => {
    expect(() => validateAudio(recording('application/pdf'))).toThrow('Record with WebM, MP3, MP4, WAV, or OGG audio')
  })
})