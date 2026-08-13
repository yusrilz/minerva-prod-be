import { app } from './app'
import { config } from './config/env'
import { connectDatabase, disconnectDatabase } from './db/mongo'
import { seedScholarships, seedIelts, seedMentors } from './db/seed'
import { runMilestoneReminders } from './modules/reminders/service'

async function start() {
  const connected = await connectDatabase()
  if (connected) {
    try {
      await Promise.all([seedScholarships(), seedIelts(), seedMentors()])
      console.info('[database] scholarship catalog, IELTS content, and mentor catalog are ready')
    } catch (error) {
      if (config.isProduction) throw error
      console.warn('[database] seed failed', error)
    }
  }

  app.listen({ port: config.port, hostname: '0.0.0.0' })
  console.info(`Minerva API running at http://localhost:${app.server?.port}`)

  // ponytail: in-process cron; misses a day if the server is down at 19:00. Add an external scheduler if uptime isn't guaranteed.
  Bun.cron('0 19 * * *', () => {
    runMilestoneReminders().catch((error) => console.error('[reminders] milestone cron failed', error))
  })
  console.info('[reminders] deadline reminder cron scheduled for 19:00 daily')
}

async function shutdown(signal: string) {
  console.info(`[server] received ${signal}; shutting down`)
  await app.stop()
  await disconnectDatabase()
  process.exit(0)
}

if (import.meta.main) {
  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  await start()
}

export { app }
export type { App } from './app'
