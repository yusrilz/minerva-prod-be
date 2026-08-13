import { describe, expect, it } from 'bun:test'
import { EliceTerraAdapter } from './adapters/elice-terra'
import { EliceWhisperAdapter } from './adapters/elice-whisper'
import { AiError } from './errors'
import { parseDocumentRefine, parseDocumentReview } from './validation'

const metadata = {
  provider: 'elice' as const,
  model: 'gpt-5.6-terra',
  usage: { promptTokens: 1, completionTokens: 2, cachedPromptTokens: 0 },
  latencyMs: 5,
}

describe('AI response validation', () => {
  it('parses a complete document review', () => {
    const result = parseDocumentReview(
      JSON.stringify({
        overall: 82,
        clarity: 80,
        grammar: 84,
        structure: 81,
        impact: 79,
        scholarshipAlignment: 86,
        summary: 'A focused draft with clear evidence.',
        strengths: ['Uses a concrete example.'],
        suggestions: [
          {
            category: 'clarity',
            title: 'Tighten the opening',
            detail: 'State the responsibility earlier.',
            originalText: 'I was responsible for the project.',
            replacement: 'I led the project from planning through delivery.',
            priority: 'high',
            tone: 'purple',
          },
        ],
      }),
      metadata,
    )

    expect(result.overall).toBe(82)
    expect(result.suggestions[0]?.priority).toBe('high')
  })

  it('parses a complete document refine', () => {
    const result = parseDocumentRefine(
      JSON.stringify({
        summary: 'Tightened the opening and strengthened one impact sentence.',
        changes: [
          {
            originalText: 'I was responsible for the project.',
            replacement: 'I led the project from planning through delivery.',
            reason: 'Makes ownership clearer.',
          },
        ],
      }),
      metadata,
    )

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]?.reason).toBe('Makes ownership clearer.')
  })

  it('rejects incomplete structured output', () => {
    expect(() => parseDocumentReview('{"overall": 90}', metadata)).toThrow(AiError)
  })
})

describe('Elice adapters', () => {
  it('calls the OpenAI-compatible Terra route and parses usage', async () => {
    let requestedUrl = ''
    let authorization = ''
    const fetchMock = (async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrl = String(input)
      authorization = new Headers(init?.headers).get('authorization') || ''
      return new Response(
        JSON.stringify({
          id: 'request-1',
          model: 'gpt-5.6-terra',
          choices: [{ message: { content: 'Hello' } }],
          usage: { prompt_tokens: 4, completion_tokens: 2, cached_prompt_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch
    const adapter = new EliceTerraAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/model',
      fetch: fetchMock,
      maxRetries: 0,
    })

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(requestedUrl).toBe('https://example.test/model/v1/chat/completions')
    expect(authorization).toBe('Bearer test-key')
    expect(result.content).toBe('Hello')
    expect(result.metadata.usage.cachedPromptTokens).toBe(1)
  })

  it('sends Whisper audio as multipart form data', async () => {
    let contentType: string | null = 'not-called'
    let bodyWasFormData = false
    const fetchMock = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      contentType = new Headers(init?.headers).get('content-type')
      bodyWasFormData = init?.body instanceof FormData
      return new Response(
        JSON.stringify({
          _result: { status: 'ok', reason: null },
          transcript: {
            text: 'Test transcript',
            chunks: [{ timestamp: [0, 1.25], text: 'Test transcript' }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch
    const adapter = new EliceWhisperAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/whisper',
      fetch: fetchMock,
      maxRetries: 0,
    })

    const result = await adapter.transcribe({
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      filename: 'answer.webm',
      returnTimestamps: 'word',
    })

    expect(contentType).toBeNull()
    expect(bodyWasFormData).toBe(true)
    expect(result.text).toBe('Test transcript')
    expect(result.chunks[0]?.timestamp).toEqual([0, 1.25])
  })
})
