# Shared AI proxy (Cloudflare Worker)

This lets the Claude coach work for **every user with no per-user API key**. Your
real Anthropic key lives only inside the Worker (server-side) — it is never
shipped to the browser.

> **Why not just put the key in `index.html`?** Anything in `index.html` is
> public — anyone can open DevTools, copy the key, and run up your bill.
> Anthropic also auto-revokes leaked keys. A proxy is the only safe way.

## What you'll have at the end
- A URL like `https://dl-siski-ai.<you>.workers.dev`.
- You paste that URL into `AI_PROXY` in `index.html`, and AI "just works" for
  everyone, with the local coach as a fallback.

## Deploy (Dashboard — easiest, ~5 min)
1. Create a free account at <https://dash.cloudflare.com> → **Workers & Pages**
   → **Create** → **Create Worker**. Give it a name (e.g. `dl-siski-ai`).
2. Click **Edit code**, delete the sample, paste the contents of
   [`anthropic-proxy.js`](./anthropic-proxy.js), then **Deploy**.
3. Open the Worker → **Settings → Variables and Secrets**:
   - Add a **Secret** named `ANTHROPIC_API_KEY` = your real `sk-ant-...` key.
   - (Recommended) Add a **Variable** `ALLOWED_ORIGIN` = the exact origin where
     you host the app (e.g. `https://dltate.example.com`). Use `*` only for
     local testing.
   - (Optional) `MAX_TOKENS` (default `1024`) caps reply length / cost.
4. Copy the Worker URL from the top of the page.

## Deploy (CLI alternative)
```bash
npm i -g wrangler
wrangler login
# put anthropic-proxy.js as your worker entry, then:
wrangler secret put ANTHROPIC_API_KEY   # paste your sk-ant-... key
wrangler deploy
```

## Wire it into the app
Open `index.html`, find:
```js
var AI_PROXY='';
```
and set it to your Worker URL:
```js
var AI_PROXY='https://dl-siski-ai.<you>.workers.dev';
```
That's it — the AI key card now shows "Claude is connected" and no user needs a key.

## Cost protection (important — you pay per call)
Built into the Worker:
- **Model allowlist** (defaults to the cheapest, Haiku) and a **`max_tokens` cap**.
- **`ALLOWED_ORIGIN`** lock so only your site can call it.

Strongly recommended on top:
- **Global daily cap:** create a KV namespace, bind it to the Worker as `RL`,
  and set a variable `DAILY_CAP` (e.g. `2000`). The Worker then returns
  `429 daily_limit_reached` once the cap is hit for the day.
- **Cloudflare rate limiting** (dashboard → Security → WAF → Rate limiting
  rules) to throttle per-IP bursts.
- Consider gating behind login if usage grows.

## Test
```bash
curl -X POST https://dl-siski-ai.<you>.workers.dev \
  -H 'content-type: application/json' \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```
You should get a normal Anthropic JSON response.
