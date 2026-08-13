import { describe, expect, it } from 'bun:test'
import { resolveMongoSrvUri } from './mongo'

const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/dns-json' },
})

describe('MongoDB SRV DNS fallback', () => {
  it('builds a direct TLS URI while preserving credentials, database, and TXT options', async () => {
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.searchParams.get('type') === 'TXT') {
        return json({
          Status: 0,
          Answer: [{ type: 16, data: '"authSource=admin&replicaSet=atlas-test-shard-0"' }],
        })
      }
      return json({
        Status: 0,
        Answer: [
          { type: 33, data: '0 0 27017 node-a.cluster.mongodb.net.' },
          { type: 33, data: '0 0 27018 node-b.cluster.mongodb.net.' },
        ],
      })
    }) as typeof fetch

    const result = await resolveMongoSrvUri(
      'mongodb+srv://user:pass@minerva.cluster.mongodb.net/minerva?retryWrites=true',
      fakeFetch,
    )

    expect(result).toStartWith('mongodb://user:pass@')
    expect(result).toContain('node-a.cluster.mongodb.net:27017')
    expect(result).toContain('node-b.cluster.mongodb.net:27018')
    expect(result).toContain('/minerva?')
    const options = new URLSearchParams(result.split('?')[1])
    expect(options.get('retryWrites')).toBe('true')
    expect(options.get('authSource')).toBe('admin')
    expect(options.get('replicaSet')).toBe('atlas-test-shard-0')
    expect(options.get('tls')).toBe('true')
  })

  it('rejects SRV targets outside the configured cluster domain', async () => {
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.searchParams.get('type') === 'TXT') return json({ Status: 0, Answer: [] })
      return json({
        Status: 0,
        Answer: [{ type: 33, data: '0 0 27017 attacker.example.com.' }],
      })
    }) as typeof fetch

    await expect(resolveMongoSrvUri(
      'mongodb+srv://user:pass@minerva.cluster.mongodb.net/minerva',
      fakeFetch,
    )).rejects.toThrow('invalid MongoDB SRV target')
  })
})
