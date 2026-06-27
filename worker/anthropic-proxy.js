/**
 * Dl. Siski — Anthropic proxy (Cloudflare Worker)
 * -----------------------------------------------------------------------------
 * Keeps your Anthropic API key SECRET (server-side) so the app can offer the
 * Claude coach to every user without anyone pasting a key. The browser calls
 * this Worker; the Worker adds the key and forwards to Anthropic.
 *
 * Setup (see worker/README.md):
 *   1. wrangler secret put ANTHROPIC_API_KEY      (your real sk-ant-... key)
 *   2. (optional) set vars ALLOWED_ORIGIN, MAX_TOKENS, DAILY_CAP
 *   3. (optional, for the daily budget cap) bind a KV namespace as RL
 *   4. Deploy, then paste the Worker URL into AI_PROXY in index.html.
 *
 * Cost protection built in: model allowlist, max_tokens cap, optional origin
 * lock, and an optional KV-backed global daily request cap.
 */

const MODEL_ALLOWLIST = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin === '*' ? '*' : allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
    };

    // CORS preflight
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    // Optional origin lock
    if (allowOrigin !== '*' && origin && origin !== allowOrigin) {
      return json({ error: 'forbidden_origin' }, 403, cors);
    }

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server_not_configured' }, 500, cors);

    // Parse + sanitize the request body
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, cors); }
    if (!body || !Array.isArray(body.messages)) return json({ error: 'missing_messages' }, 400, cors);

    const maxTokensCap = parseInt(env.MAX_TOKENS || '1024', 10);
    const model = MODEL_ALLOWLIST.includes(body.model) ? body.model : MODEL_ALLOWLIST[0];
    const safeBody = {
      model,
      max_tokens: Math.min(parseInt(body.max_tokens || 700, 10) || 700, maxTokensCap),
      messages: body.messages,
    };
    if (typeof body.system === 'string') safeBody.system = body.system.slice(0, 12000);

    // Optional global daily cap (needs a KV namespace bound as RL)
    if (env.RL && env.DAILY_CAP) {
      const cap = parseInt(env.DAILY_CAP, 10);
      const key = 'count:' + new Date().toISOString().slice(0, 10);
      const used = parseInt((await env.RL.get(key)) || '0', 10);
      if (used >= cap) return json({ error: 'daily_limit_reached' }, 429, cors);
      // best-effort increment (expires after 2 days)
      env.RL.put(key, String(used + 1), { expirationTtl: 172800 });
    }

    // Forward to Anthropic with the secret key
    let upstream;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(safeBody),
      });
    } catch {
      return json({ error: 'upstream_unreachable' }, 502, cors);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...(cors || {}), 'content-type': 'application/json' },
  });
}
