export default {
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(ping())
  },
}

async function ping() {
  const response = await fetch('https://api.minerva.ac.id/api/health')
  if (!response.ok) {
    console.error('keep-warm ping failed:', response.status, response.statusText)
  }
}
