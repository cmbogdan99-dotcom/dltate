# Shared AI proxy (Cloudflare Worker)

Gives every user the AI coach with **no per-user key**. Your backend key (if
any) lives only inside the Worker — never shipped to the browser.

The Worker picks a backend automatically, first available wins:

| Priority | Backend | Cost | Notes |
|---|---|---|---|
| 1 | `GROQ_API_KEY` | **Free** (free key, no card) | Best free quality (Llama 3.3 70B) |
| 2 | `ANTHROPIC_API_KEY` | Paid | Best quality, supports image scan |
| 3 | `AI` binding (Workers AI) | **Free** (no key at all) | Cloudflare built-in Llama — the default |

> **Totally free, zero keys:** just deploy. `wrangler.toml` already binds
> Workers AI, so with no secrets set it uses Cloudflare's free models. Add a
> free Groq key later if you want better answers.

## Deploy (Git-connected — what you're doing now)
1. Cloudflare → **Workers & Pages → Create → Worker** → connect this repo.
2. **Advanced settings → Path / Root directory:** `worker`
3. **Deploy command:** `npx wrangler deploy` (default)
4. For **totally free**: leave the Variable fields **empty** and click **Deploy**.
   (Optional, better quality: add a **Secret** `GROQ_API_KEY` — see below.)
5. Copy the Worker URL (e.g. `https://dl-siski-ai.<you>.workers.dev`) and paste
   it into `AI_PROXY` in `index.html`.

## Optional: free Groq key for better answers
1. Get a free key at <https://console.groq.com/keys> (no credit card).
2. Worker → **Settings → Variables and Secrets → Add → Secret**:
   `GROQ_API_KEY` = your `gsk_...` key. Redeploy.

## Cost / abuse protection
- `ALLOWED_ORIGIN` (Variable) — lock to your site's origin.
- `MAX_TOKENS` (Variable, default `1024`) — caps reply length.
- `DAILY_CAP` (Variable) + a KV namespace bound as `RL` — global daily request
  cap; returns `429` when hit. (Free backends are already free, but this guards
  the paid Anthropic path.)

## Notes
- **Image scan** (nutrition/screenshot) needs a vision model, so it only works
  on the **Anthropic** path. On the free text backends it returns an empty
  result and the app shows "couldn't extract" — the chat coach works fine.
- All backends return an Anthropic-shaped response, so the app needs no change.

## Test
```bash
curl -X POST https://dl-siski-ai.<you>.workers.dev \
  -H 'content-type: application/json' \
  -d '{"max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
# → {"content":[{"type":"text","text":"..."}]}
```
