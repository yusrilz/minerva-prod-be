import mongoose from 'mongoose'
import { config } from '../config/env'
import { AppError } from '../lib/errors'

mongoose.set('bufferCommands', false)

let lastConnectionError: string | null = null

type DnsJsonAnswer = {
  type?: number
  data?: string
}

type DnsJsonResponse = {
  Status?: number
  Answer?: DnsJsonAnswer[]
}

const dnsOverHttpsUrl = Bun.env.MONGODB_DOH_URL?.trim() || 'https://cloudflare-dns.com/dns-query'

const queryDns = async (
  hostname: string,
  type: 'SRV' | 'TXT',
  fetcher: typeof fetch,
): Promise<DnsJsonAnswer[]> => {
  const endpoint = new URL(dnsOverHttpsUrl)
  endpoint.searchParams.set('name', hostname)
  endpoint.searchParams.set('type', type)
  const response = await fetcher(endpoint, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`DNS-over-HTTPS returned ${response.status}`)
  const payload = await response.json() as DnsJsonResponse
  if (payload.Status !== 0 || !Array.isArray(payload.Answer)) {
    throw new Error(`DNS-over-HTTPS could not resolve ${type} records`)
  }
  return payload.Answer
}

const parseTxtOptions = (answers: DnsJsonAnswer[]): URLSearchParams => {
  const value = answers
    .filter((answer) => answer.type === 16 && typeof answer.data === 'string')
    .map((answer) => String(answer.data).replace(/^"|"$/g, '').replace(/"\s+"/g, ''))
    .join('&')
  return new URLSearchParams(value)
}

export async function resolveMongoSrvUri(
  mongoUri: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const source = new URL(mongoUri)
  if (source.protocol !== 'mongodb+srv:') return mongoUri

  const srvName = `_mongodb._tcp.${source.hostname}`
  const [srvAnswers, txtAnswers] = await Promise.all([
    queryDns(srvName, 'SRV', fetcher),
    queryDns(source.hostname, 'TXT', fetcher).catch(() => []),
  ])
  const allowedSuffix = `.${source.hostname.split('.').slice(1).join('.')}`
  const hosts = srvAnswers
    .filter((answer) => answer.type === 33 && typeof answer.data === 'string')
    .map((answer) => String(answer.data).trim().split(/\s+/))
    .map((parts) => {
      const port = Number(parts[2])
      const target = String(parts[3] || '').replace(/\.$/, '').toLowerCase()
      if (!target.endsWith(allowedSuffix) || !Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error('DNS-over-HTTPS returned an invalid MongoDB SRV target')
      }
      return `${target}:${port}`
    })

  if (!hosts.length) throw new Error('DNS-over-HTTPS returned no MongoDB SRV targets')

  const options = new URLSearchParams(source.search)
  for (const [key, value] of parseTxtOptions(txtAnswers)) {
    if (!options.has(key)) options.set(key, value)
  }
  options.set('tls', 'true')

  const credentials = source.username
    ? `${source.username}${source.password ? `:${source.password}` : ''}@`
    : ''
  const query = options.toString()
  return `mongodb://${credentials}${hosts.join(',')}${source.pathname || '/'}${query ? `?${query}` : ''}`
}

const connectionOptions = () => ({
  serverSelectionTimeoutMS: config.isProduction ? 10_000 : 3_000,
  maxPoolSize: 10,
})

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unknown MongoDB connection error'

const shouldRetrySrv = (uri: string, error: unknown) =>
  uri.startsWith('mongodb+srv://') && /querySrv|ECONNREFUSED|ENOTFOUND|ETIMEOUT|DNS/i.test(errorMessage(error))

export async function connectDatabase() {
  if (!config.mongoUri) {
    lastConnectionError = 'MONGODB_URI is not configured'
    if (config.isProduction) throw new Error(lastConnectionError)
    console.warn(`[database] ${lastConnectionError}; API is starting in degraded mode`)
    return false
  }

  if (mongoose.connection.readyState === 1) return true

  try {
    await mongoose.connect(config.mongoUri, connectionOptions())
    lastConnectionError = null
    console.info(`[database] connected to ${mongoose.connection.name}`)
    return true
  } catch (initialError) {
    if (shouldRetrySrv(config.mongoUri, initialError)) {
      try {
        await mongoose.disconnect().catch(() => undefined)
        const directUri = await resolveMongoSrvUri(config.mongoUri)
        await mongoose.connect(directUri, connectionOptions())
        lastConnectionError = null
        console.info(`[database] connected to ${mongoose.connection.name} using the SRV DNS fallback`)
        return true
      } catch (fallbackError) {
        lastConnectionError = `${errorMessage(initialError)}; SRV fallback failed: ${errorMessage(fallbackError)}`
      }
    } else {
      lastConnectionError = errorMessage(initialError)
    }

    if (config.isProduction) throw new Error(lastConnectionError)
    console.warn(`[database] connection failed; API is starting in degraded mode: ${lastConnectionError}`)
    return false
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}

export function requireDatabase() {
  if (mongoose.connection.readyState !== 1) {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is currently unavailable')
  }
}

export function databaseHealth() {
  const states: Record<number, 'disconnected' | 'connected' | 'connecting' | 'disconnecting'> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }
  return {
    status: states[mongoose.connection.readyState] ?? 'unknown',
    database: mongoose.connection.name || null,
    error: lastConnectionError,
  }
}
