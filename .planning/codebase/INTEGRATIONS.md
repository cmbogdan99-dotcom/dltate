# External Integrations

**Analysis Date:** 2026-07-13

## APIs & External Services

**AI / Chat & Vision:**
- Anthropic Claude API — direct client call (BYO key) at `index.html:301` (`https://api.anthropic.com/v1/messages`, model `claude-haiku-4-5-20251001`), used for chat coaching (`index.html:4591`) and food-photo/nutrition-label scanning (`index.html:1562`)
  - Auth: user-supplied API key stored in `S.anthropicKey`, persisted via `DB.save('anthropicKey', v)` (`index.html:5079`), loaded at boot `index.html:1092`
  - Header: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` (direct browser calls, no server needed)
- OpenAI Chat Completions API — direct client call (BYO key) at `index.html:4597` (`https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`), fallback chat provider when Anthropic isn't configured
  - Auth: user-supplied key `S.openaiKey`, sent as `Authorization: Bearer <key>`
- Shared AI Proxy (`AI_PROXY` constant, Cloudflare Worker) — used instead of direct Anthropic calls when `aiProxyOn()` is true (`index.html:296-301`); always speaks the Anthropic response shape so no client-side branching is needed
  - Backend chain in `worker/anthropic-proxy.js`: (1) `ANTHROPIC_API_KEY` secret → real Claude, (2) `GROQ_API_KEY` secret → Groq `llama-3.3-70b-versatile` (text-only, no image support), (3) Cloudflare Workers AI binding (`env.AI`, model `@cf/meta/llama-3.1-8b-instruct`, free, text-only, default with no key/card needed)
  - No auth from client to proxy (open endpoint, optional CORS origin allowlist via `ALLOWED_ORIGIN`, optional daily rate cap via KV binding `RL` + `DAILY_CAP`)

**Nutrition Data:**
- OpenFoodFacts public API — `index.html:1535`, `GET https://world.openfoodfacts.org/api/v2/product/{barcode}` for barcode-scanned food lookups; no auth required

## Data Storage

**Databases:**
- Firebase Realtime Database (Europe-west1) — sole persistent data store
  - Connection: inline config `_fbCfg` at `index.html:905` (`databaseURL: https://dltate-162f6-default-rtdb.europe-west1.firebasedatabase.app`, `projectId: dltate-162f6`)
  - Client: Firebase compat SDK v10.12.0 (`firebase.database()` → global `RTDB` at `index.html:907`)
  - API key embedded directly in client code (standard for Firebase web apps; access is controlled via Firebase RTDB security rules, not by hiding the key)

**File Storage:**
- Local filesystem only, via browser `localStorage` (safe wrapper at `index.html:887-891` with in-memory fallback when `localStorage` is unavailable, e.g. inside `data:` URL contexts)

**Caching:**
- None (no service worker / cache API usage detected in `index.html`)

## Authentication & Identity

**Auth Provider:**
- Custom / none — no third-party auth SDK (no Firebase Auth, no OAuth). User identity appears to be app-local (profile-based), persisted directly in Firebase RTDB and/or `localStorage`

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry/Bugsnag or similar. Global `window.onerror` handler present (`index.html:277`) that specifically ignores `localStorage`/`data:`-URL related errors, no external reporting

**Logs:**
- Browser console only; no remote logging service

## CI/CD & Deployment

**Hosting:**
- Static PWA host (unspecified — served as a plain `index.html`); Android/iOS via Capacitor native builds
- Cloudflare Workers for the AI proxy — "Git-connected deploy" per commit history (`wrangler.toml` in `worker/`), deployed independently of the main app

**CI Pipeline:**
- None detected (no `.github/workflows`, no CI config files)

## Environment Configuration

**Required env vars (Cloudflare Worker, all optional):**
- `ANTHROPIC_API_KEY` — enables paid Claude backend on the proxy
- `GROQ_API_KEY` — enables free Groq backend (text-only)
- `ALLOWED_ORIGIN` — CORS origin allowlist (defaults to `*`)
- `MAX_TOKENS` — caps response length (default 1024)
- `DAILY_CAP` + KV namespace binding `RL` — optional global daily request cap
- `[ai]` binding `AI` — Cloudflare Workers AI (free default backend, no secret needed)

**Client-side "env" equivalents (no `.env` files used):**
- Firebase config hardcoded in `index.html:905`
- Anthropic/OpenAI API keys entered by end users in the Profile → AI settings UI (`index.html:5074-5079`) and stored per-user in Firebase RTDB / `localStorage`

**Secrets location:**
- Cloudflare Worker secrets set via Cloudflare dashboard or `wrangler secret put` (not present in repo)
- No `.env` file present in this repo

## Webhooks & Callbacks

**Incoming:**
- None (Cloudflare Worker is a request/response proxy, not a webhook receiver)

**Outgoing:**
- None

---

*Integration audit: 2026-07-13*
