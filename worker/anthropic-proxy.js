/**
 * Dl. Siski — AI proxy (Cloudflare Worker)
 * -----------------------------------------------------------------------------
 * Gives every user the AI coach with NO per-user key. Picks a backend in this
 * order (first one available wins):
 *
 *   1. GROQ_API_KEY secret      → Groq (free key, no card; best free quality)
 *   2. ANTHROPIC_API_KEY secret → Claude (paid, best quality, supports images)
 *   3. AI binding (Workers AI)  → Cloudflare's built-in free models (Llama)
 *
 * For "totally free" you don't need ANY key: just deploy with the [ai] binding
 * (already in wrangler.toml) and it uses Workers AI. Optionally add a free Groq
 * key later for better answers.
 *
 * The app sends Anthropic-shaped requests; this Worker always replies in the
 * Anthropic shape { content:[{ type:'text', text }] } so the app needs no change.
 */

const CF_TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CF_FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export default {
  async fetch(request, env) {
    const allowOrigin = env.ALLOWED_ORIGIN || '*';
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin === '*' ? '*' : allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    if (allowOrigin !== '*' && origin && origin !== allowOrigin) return json({ error: 'forbidden_origin' }, 403, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, cors); }
    if (!body || !Array.isArray(body.messages)) return json({ error: 'missing_messages' }, 400, cors);

    const maxTokens = Math.min(parseInt(body.max_tokens || 700, 10) || 700, parseInt(env.MAX_TOKENS || '1024', 10));
    // Image requests (nutrition/screenshot scan) carry array content — only the
    // Anthropic vision path supports them; free text models get a no-op reply.
    const hasImage = body.messages.some((m) => Array.isArray(m.content));

    // Optional global daily cap (needs a KV namespace bound as RL + DAILY_CAP var)
    if (env.RL && env.DAILY_CAP) {
      const cap = parseInt(env.DAILY_CAP, 10);
      const k = 'count:' + new Date().toISOString().slice(0, 10);
      const used = parseInt((await env.RL.get(k)) || '0', 10);
      if (used >= cap) return json({ error: 'daily_limit_reached', content: [{ type: 'text', text: '' }] }, 429, cors);
      env.RL.put(k, String(used + 1), { expirationTtl: 172800 });
    }

    // 1) Anthropic (paid) — full quality, supports images
    if (env.ANTHROPIC_API_KEY) {
      const safe = { model: pickAnthropicModel(body.model), max_tokens: maxTokens, messages: body.messages };
      if (typeof body.system === 'string') safe.system = body.system.slice(0, 12000);
      try {
        const up = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(safe),
        });
        return new Response(await up.text(), { status: up.status, headers: { ...cors, 'content-type': 'application/json' } });
      } catch { return json({ error: 'upstream_unreachable' }, 502, cors); }
    }

    // Free text backends can't read images — return an empty reply so the app
    // gracefully shows "couldn't extract".
    if (hasImage) return json({ content: [{ type: 'text', text: '' }] }, 200, cors);

    // Build a plain chat history (system + text turns)
    const msgs = [];
    if (typeof body.system === 'string' && body.system) msgs.push({ role: 'system', content: body.system });
    for (const m of body.messages) if (typeof m.content === 'string') msgs.push({ role: m.role, content: m.content });

    // 2) Groq (free key, no card) — best free quality
    if (env.GROQ_API_KEY) {
      try {
        const up = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ model: env.GROQ_MODEL || GROQ_MODEL, max_tokens: maxTokens, messages: msgs }),
        });
        const d = await up.json();
        const text = d && d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
        return json({ content: [{ type: 'text', text: text || '' }] }, 200, cors);
      } catch { return json({ error: 'upstream_unreachable', content: [{ type: 'text', text: '' }] }, 502, cors); }
    }

    // 3) Workers AI (Cloudflare built-in, totally free) — default
    if (env.AI) {
      try {
        const out = await env.AI.run(env.CF_MODEL || CF_TEXT_MODEL, { messages: msgs, max_tokens: maxTokens });
        const text = (out && (out.response || out.result)) || '';
        return json({ content: [{ type: 'text', text }] }, 200, cors);
      } catch (e) {
        // Primary model may be retired — try the fallback before giving up
        try {
          const out = await env.AI.run(CF_FALLBACK_MODEL, { messages: msgs, max_tokens: maxTokens });
          const text = (out && (out.response || out.result)) || '';
          return json({ content: [{ type: 'text', text }] }, 200, cors);
        } catch (e2) {
          return json({ error: 'workers_ai_error', detail: String((e2 && e2.message) || e2), content: [{ type: 'text', text: '' }] }, 502, cors);
        }
      }
    }

    return json({ error: 'no_backend_configured' }, 500, cors);
  },
};

function pickAnthropicModel(m) {
  const ok = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
  return ok.includes(m) ? m : ok[0];
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...(cors || {}), 'content-type': 'application/json' } });
}
