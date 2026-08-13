const score = { type: 'number', minimum: 0, maximum: 100 } as const
const bandScore = { type: 'number', minimum: 0, maximum: 9 } as const
const shortString = { type: 'string', minLength: 1, maxLength: 2_000 } as const

const criterion = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'feedback'],
  properties: {
    score: bandScore,
    feedback: shortString,
  },
} as const

export const documentReviewSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overall',
    'clarity',
    'grammar',
    'structure',
    'impact',
    'scholarshipAlignment',
    'summary',
    'strengths',
    'suggestions',
  ],
  properties: {
    overall: score,
    clarity: score,
    grammar: score,
    structure: score,
    impact: score,
    scholarshipAlignment: score,
    summary: shortString,
    strengths: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: shortString,
    },
    suggestions: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'category',
          'title',
          'detail',
          'originalText',
          'replacement',
          'priority',
          'tone',
        ],
        properties: {
          category: { type: 'string', minLength: 1, maxLength: 80 },
          title: { type: 'string', minLength: 1, maxLength: 160 },
          detail: shortString,
          originalText: { type: 'string', minLength: 1, maxLength: 4_000 },
          replacement: { type: 'string', minLength: 1, maxLength: 4_000 },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          tone: { type: 'string', enum: ['purple', 'yellow', 'blue', 'green'] },
        },
      },
    },
  },
}

export const documentRefineSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes'],
  properties: {
    summary: shortString,
    changes: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['originalText', 'replacement', 'reason'],
        properties: {
          originalText: { type: 'string', minLength: 1, maxLength: 4_000 },
          replacement: { type: 'string', minLength: 1, maxLength: 4_000 },
          reason: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
  },
}

export const documentConsultSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'intent', 'refineInstruction'],
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 4_000 },
    intent: { type: 'string', enum: ['advise', 'refine'] },
    refineInstruction: { type: 'string', minLength: 1, maxLength: 1_000 },
  },
}

export const interviewPlanSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 5,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'focus'],
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 800 },
          focus: { type: 'string', minLength: 1, maxLength: 300 },
        },
      },
    },
  },
}

export const interviewAnswerSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'relevance',
    'clarity',
    'structure',
    'specificity',
    'scholarshipAlignment',
    'highlights',
    'improvements',
    'strongerAnswerExample',
  ],
  properties: {
    relevance: score,
    clarity: score,
    structure: score,
    specificity: score,
    scholarshipAlignment: score,
    highlights: { type: 'array', minItems: 1, maxItems: 6, items: shortString },
    improvements: { type: 'array', minItems: 1, maxItems: 6, items: shortString },
    strongerAnswerExample: { type: 'string', minLength: 1, maxLength: 5_000 },
  },
}

export const interviewReplySchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'followUp'],
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 500 },
    followUp: { type: 'string', maxLength: 700 },
  },
}

export const ieltsWritingSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'taskAchievement',
    'coherenceAndCohesion',
    'lexicalResource',
    'grammaticalRangeAndAccuracy',
    'estimatedBand',
    'strengths',
    'improvements',
    'correctedExamples',
  ],
  properties: {
    taskAchievement: criterion,
    coherenceAndCohesion: criterion,
    lexicalResource: criterion,
    grammaticalRangeAndAccuracy: criterion,
    estimatedBand: bandScore,
    strengths: { type: 'array', minItems: 1, maxItems: 6, items: shortString },
    improvements: { type: 'array', minItems: 1, maxItems: 6, items: shortString },
    correctedExamples: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['original', 'correction', 'explanation'],
        properties: {
          original: { type: 'string', minLength: 1, maxLength: 1_500 },
          correction: { type: 'string', minLength: 1, maxLength: 1_500 },
          explanation: { type: 'string', minLength: 1, maxLength: 1_500 },
        },
      },
    },
  },
}

export const ieltsSpeakingSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fluencyAndCoherence',
    'lexicalResource',
    'grammaticalRangeAndAccuracy',
    'estimatedBand',
    'strengths',
    'improvements',
  ],
  properties: {
    fluencyAndCoherence: criterion,
    lexicalResource: criterion,
    grammaticalRangeAndAccuracy: criterion,
    estimatedBand: bandScore,
    strengths: { type: 'array', minItems: 1, maxItems: 6, items: shortString },
    improvements: { type: 'array', minItems: 1, maxItems: 6, items: shortString },
  },
}

export const ieltsSpeakingTurnSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'nextQuestion', 'shouldContinue'],
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 500 },
    nextQuestion: { type: 'string', maxLength: 700 },
    shouldContinue: { type: 'boolean' },
  },
}
