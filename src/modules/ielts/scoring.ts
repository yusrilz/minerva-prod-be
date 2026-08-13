export const normalizeAnswer = (value: unknown) => String(value ?? '').trim().toLowerCase()

export function scoreAnswers(questions: Array<Record<string, any>>, answers: Array<string | number>) {
  let score = 0
  questions.forEach((question, index) => {
    const given = normalizeAnswer(answers[index])
    if (given && given === normalizeAnswer(question.correctAnswer)) score += 1
  })
  return { score, totalQuestions: questions.length }
}

// IELTS Academic Reading and Listening use a 40-question raw score. Practice
// sets can contain fewer questions, so their result is scaled before applying
// a conservative public band conversion.
export function objectiveBand(score: number, totalQuestions: number) {
  if (!totalQuestions) return 0
  const equivalent = Math.round((score / totalQuestions) * 40)
  if (equivalent >= 39) return 9
  if (equivalent >= 37) return 8.5
  if (equivalent >= 35) return 8
  if (equivalent >= 32) return 7.5
  if (equivalent >= 30) return 7
  if (equivalent >= 26) return 6.5
  if (equivalent >= 23) return 6
  if (equivalent >= 18) return 5.5
  if (equivalent >= 16) return 5
  if (equivalent >= 13) return 4.5
  if (equivalent >= 10) return 4
  if (equivalent >= 6) return 3.5
  return equivalent > 0 ? 3 : 0
}