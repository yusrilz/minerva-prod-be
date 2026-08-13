export const defaultChecklistItems = [
  ['cv', 'Update CV', 'Tailored CV uploaded and ready for review', 'Core documents', true],
  ['essay', 'Draft essay', 'Write the first draft for your scholarship essay', 'Written materials', true],
  ['study-plan', 'Prepare study plan', 'Outline academic goals and post-study impact', 'Written materials', true],
  ['research-plan', 'Prepare research plan', 'Define your research question, method, and expected contribution', 'Written materials', false],
  ['recommendation', 'Request recommendation letter', 'Ask your referee and send submission instructions', 'References', true],
  ['ielts', 'Add English test certificate', 'Upload IELTS, TOEFL, or another accepted result if required', 'Language', false],
  ['passport', 'Upload passport copy', 'Identity document required for application submission', 'Core documents', true],
  ['application', 'Complete application form', 'Review every response before the official submission', 'Submission', true],
].map(([itemKey, title, description, category, required], order) => ({
  itemKey: String(itemKey),
  title: String(title),
  description: String(description),
  category: String(category),
  required: Boolean(required),
  status: 'pending' as const,
  notes: '',
  order,
}))

export const defaultDocuments = [
  {
    blueprintKey: 'cv', kind: 'cv' as const, title: 'CV / Resume', description: 'Experience, leadership, and measurable outcomes',
    category: 'CV', prompt: 'Present the experience, leadership, and measurable outcomes most relevant to this scholarship.',
  },
  {
    blueprintKey: 'essay', kind: 'essay' as const, title: 'Essay', description: 'A prompt-specific scholarship response',
    category: 'Essay', prompt: 'Write a clear scholarship essay that connects your story, evidence, and future contribution.',
  },
  {
    blueprintKey: 'study-plan', kind: 'study' as const, title: 'Study Plan', description: 'Academic goals and learning pathway',
    category: 'Study Plan', prompt: 'Outline what you will study, why it matters, and how you will apply it after graduation.',
  },
  {
    blueprintKey: 'research-plan', kind: 'research' as const, title: 'Research Plan', description: 'Research question, methods, and expected contribution',
    category: 'Research Plan', prompt: 'Define the research question, method, feasibility, and expected contribution.',
  },
].map((document, order) => ({
  ...document,
  contentHtml: '',
  contentText: '',
  status: 'missing' as const,
  order,
}))

export const obsoleteDocumentBlueprintKeys = [
  'leadership-essay',
  'personal-statement',
  'statement-of-purpose',
  'academic-transcript',
] as const
