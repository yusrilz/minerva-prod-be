# Deployment Design — Minerva (minerva.ac.id)

**Date:** 2026-08-13 · **Status:** Approved · **Constraint:** free tier, **no credit card**

## Goal
Put the Minerva frontend and backend live under `minerva.ac.id` on $0/month, with the 19:00 scholarship deadline reminder cron firing reliably.

## Topology
| Piece | Host | Cost | Card? |
|---|---|---|---|
| Frontend (Vue/Vite static) | Cloudflare Pages | $0 | No |
| Backend API (Bun/Elysia) | Render free web service | $0 | No |
| Database + GridFS files | MongoDB Atlas M0 (512MB) | $0 | No |
| Transactional email | Resend (100/day) | $0 | No |
| DNS + CDN | Cloudflare | $0 | No |
| Keep-warm | Cloudflare Worker cron | $0 | No |

- `minerva.ac.id` → Cloudflare Pages (FE)
- `api.minerva.ac.id` → Render (BE), grey-cloud so Render's TLS issues directly

## Why these choices
- **FE → Cloudflare Pages:** build already emits a Worker static server (`sites/worker.js` → `dist/server/index.js`); Pages is the intended target, free + no card + global CDN.
- **BE → Render free:** the only no-card host that runs a Bun long-running process. Caveats accepted: ~1-min cold start after 15 min idle; 750 instance-hrs/month shared across free web services; 5GB outbound/month; service may be restarted anytime.
- **Cron (19:00):** Render free has no cron. In-process `Bun.cron` (already in `src/index.ts`) fires while the service is awake; a keep-warm ping keeps it awake in the target windows. `EmailReminder` unique-index dedup makes a missed run a skipped email, never a duplicate.
- **DB → Atlas M0:** the app needs real MongoDB (Mongoose + GridFS); M0 is free, no card.
- **Rejected:** Oracle Always-Free VM (best *with* a card: always-on, reliable cron); Render $7/mo (reliable cron + persistent disk); Fly/Railway (card); Workers-only API (Mongoose/GridFS won't run on Workers without a rewrite).

## Keep-warm strategy
- Ping `https://api.minerva.ac.id/api/health` every 5 min during **09:00–12:00** and **17:45–20:00** via a Cloudflare Worker cron (free plan: 3 cron triggers, 100k req/day).
- Patterns: `*/5 9-11,18-19 * * *` + `45-59/5 17 * * *`
- Usage ≈ 163h/month (31-day month) — ~590h under the 750 cap.
- Service is warm for the 19:00 reminder cron and morning users; sleeps otherwise (cold start outside windows ≈ acceptable).

## Setup guides

### A. Domain → Cloudflare (registrar: DomaiNesia / MyDomaiNesia)
1. **Add domain to Cloudflare first** — `dash.cloudflare.com` → **+ Add domain** → `minerva.ac.id` → Free plan → *Quick Scan* existing records → Continue. Cloudflare assigns two nameservers (copy them exactly from the zone Overview page).
2. **Check whether DNSSEC is actually on** (skip if absent). MyDomaiNesia shows no DNSSEC toggle for `.ac.id` — that's normal; it's only a problem if DS records exist at the PANDI registry. Verify with `dnssec-debugger.verisignlabs.com` (or `dig DS minerva.ac.id`): if it reports **no DS records / DNSSEC disabled**, proceed. If DS records exist and MyDomaiNesia won't let you remove them, open a DomaiNesia ticket.
3. **Change nameservers in MyDomaiNesia** — Domains → `minerva.ac.id` → **Nameserver** tab → *Use custom nameservers (enter below)* → replace NS1/NS2 with Cloudflare's two → **Change Nameservers**.
4. **Wait & verify** — propagation ~minutes to 24h. In Cloudflare click **"I updated my nameservers, check nameservers"** until status → *Active*. Confirm with `whatsmydns.net`.
5. **Add DNS records in Cloudflare** — zone `minerva.ac.id` → **DNS → Records → Add record**. Keep the auto-created `NS`/`SOA`; just add:
   - `CNAME` · Name `@` (minerva.ac.id) · Target `minerva.pages.dev` · **Proxied** (orange)
   - `CNAME` · Name `api` (api.minerva.ac.id) · Target `minerva-be.onrender.com` · **DNS only** (grey)
   - Resend records under `mail` (see E)
6. **`.ac.id` caveat:** `.ac.id` sits under the PANDI registry with DomaiNesia as reseller. The Nameserver tab usually works directly, but some `.ac.id` NS changes need a registry-side process — if it won't save or doesn't propagate after 24h, open a DomaiNesia ticket citing delegation of `minerva.ac.id` to Cloudflare.
7. **BE env:** `FRONTEND_ORIGIN=https://minerva.ac.id`, `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`.

### B. MongoDB Atlas M0
1. Sign up, create Shared (M0) cluster, region Singapore.
2. Database Access → user `minerva` + strong password.
3. Network Access → `0.0.0.0/0` (Render has no static IPs).
4. Copy connection string → `MONGODB_URI`.

### C. Backend → Render
1. Add `Dockerfile`: `FROM oven/bun:1`, copy `package.json` + `bun.lock`, `bun install --frozen-lockfile`, copy `src/`, `CMD ["bun","run","src/index.ts"]`.
2. New Web Service → repo → Docker → Free (512MB).
3. Health check `GET /api/health`.
4. Env vars (see F).
5. Custom Domain `api.minerva.ac.id` (Render issues TLS).
6. Deploy the keep-warm Worker (see Keep-warm).

### D. Frontend → Cloudflare Pages
1. Pages project from the FE GitHub repo. Build: `bun install && npm run build`; output `dist`.
2. SPA fallback: emit the Worker as `dist/_worker.js` (adjust `scripts/prepare-sites.mjs`) or deploy via `wrangler` (Workers Static Assets, `main=dist/server/index.js`, `[assets] directory=./dist`).
3. Build env: `VITE_API_URL=https://api.minerva.ac.id`.
4. Custom domain `minerva.ac.id`.
5. Google OAuth console: authorized origins `https://minerva.ac.id`; redirect `https://api.minerva.ac.id/api/auth/google/callback`.

### E. Resend
1. Sign up (free). Add Domain `mail.minerva.ac.id` (keeps apex DNS clean).
2. Add the ~5 records Resend shows into Cloudflare DNS for `mail.minerva.ac.id` (MX, SPF/TXT, DMARC, 3 DKIM TXT). Values are per-account; copy exactly, then Verify.
3. BE env: `RESEND_API_KEY=re_...`, `RESEND_FROM=Minerva <no-reply@mail.minerva.ac.id>`.
4. Free limits: 100 emails/day (reminders count).

### F. Env vars (prod)
- **FE:** `VITE_API_URL=https://api.minerva.ac.id`
- **BE:** `NODE_ENV=production`, `PORT=3000`, `FRONTEND_ORIGIN=https://minerva.ac.id`, `MONGODB_URI`, `SESSION_SECRET` (unique, ≥32 chars), `ADMIN_EMAILS`, `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`, `RESEND_API_KEY`, `RESEND_FROM`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI=https://api.minerva.ac.id/api/auth/google/callback`, `ELICE_API_KEY` + base URLs, `TTS_PROVIDER` (kokoro, or bake the Google TTS JSON into the image if keeping `google` — no disk mounts on free).

### G. Verification checklist
1. `GET https://api.minerva.ac.id/api/health` → `database: connected`.
2. Register/login from `https://minerva.ac.id` (cookie works cross-site → confirms SameSite=None).
3. Add a scholarship → "added" email lands (check Resend dashboard).
4. Set a scholarship deadline ~3 days out → confirm the 3-day email arrives at 19:00.

## Trade-offs
- Cron misses a day if Render restarts exactly at 19:00 — skipped email, never duplicate.
- 750 instance-hr cap shared across free web services — keep only one free web service; monitor the usage meter.
- 5GB outbound/month — GridFS downloads flow through Render.
- **Upgrade path (with a card later):** Oracle Always-Free VM (always-on, reliable cron) or Render $7/mo (no spin-down, persistent disk, real cron). Plan unchanged — just re-point DNS.