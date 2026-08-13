# Minerva backend

Bun + Elysia + MongoDB API for the Minerva scholarship workspace and its Elice AI integrations.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set a unique `SESSION_SECRET` of at least 32 characters.
3. Set `MONGODB_URI`.
4. Put the Elice service key in `ELICE_API_KEY`. It belongs only in this backend environment file.
5. Install and start:

```bash
bun install
bun run dev
```

The API listens on `http://localhost:3000` by default and exposes `GET /api/health`.

The configured AI services are:

- Terra: `ELICE_TERRA_BASE_URL`
- Whisper Large v3: `ELICE_WHISPER_BASE_URL`

The adapters accept base URLs and construct the provider-specific chat and audio routes internally. MongoDB SRV connections have a validated DNS-over-HTTPS fallback for runtimes where native SRV lookup is unavailable.

## Security and deployment

- Session authentication uses an HttpOnly cookie.
- For local or same-site hosting, keep `COOKIE_SAME_SITE=lax` and use HTTPS in production.
- For a frontend and API on different sites, set `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true`; authenticated mutations then validate `FRONTEND_ORIGIN`.
- AI calls consume server-side account tokens and are rate/concurrency limited.
- Rich document HTML is reduced to an allowlisted editor subset before it is returned or persisted.
- Never expose `ELICE_API_KEY` to the frontend or commit `.env`.

## Verification

```bash
bun run check
bun test
```

Live provider smoke tests are opt-in because they consume Elice credit:

```bash
RUN_ELICE_SMOKE_TESTS=true bun test src/modules/ai/ai.live.test.ts
```

Set `ELICE_SMOKE_AUDIO_PATH` as well to include Whisper transcription.
