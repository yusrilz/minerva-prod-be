import { describe, expect, it } from 'bun:test'
import { scoreAnswers } from './scoring'

describe('scoreAnswers', () => {
  it('counts exact string matches case-insensitively', () => {
    const questions = [
      { correctAnswer: 'Maya Chen' },
      { correctAnswer: 'KL4729' },
      { correctAnswer: 'rural' },
    ]
    expect(scoreAnswers(questions, ['maya chen', 'kl 4729', 'RURAL'])).toEqual({ score: 2, totalQuestions: 3 })
  })

  it('treats blank answers as incorrect', () => {
    const questions = [{ correctAnswer: 'document' }, { correctAnswer: 'agents' }]
    expect(scoreAnswers(questions, ['', undefined as unknown as string])).toEqual({ score: 0, totalQuestions: 2 })
  })
})
