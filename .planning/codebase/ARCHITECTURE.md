# Architecture

**Analysis Date:** 2026-07-13

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                     Single HTML document                          │
│                     `index.html` (~5164 lines)                    │
│  <style> (theme/CSS vars) + <script> (entire app, no bundler)     │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Global mutable state: `S` (`index.html:1625`)                    │
│  Plain object — view, nav, profile, logs, chat, onboarding draft  │
└───────────────────────┬────────────────────────────────────────--┘
         │ read/mutate            │ triggers
         ▼                        ▼
┌────────────────────────┐  ┌──────────────────────────────────────┐
│  View functions          │  │  Event handlers (inline closures)    │
│  vLogin/vOB/vMain/vDash/ │  │  attached via `el()` `click`/`inp`/  │
│  vNutr/vSport/vProgr/    │  │  `change`/`kd`/`blur` props          │
│  vGang/vTop/vAI/vProf/   │  │  mutate `S` then call `render()`     │
│  vRewards/vAdmin/...     │  │                                      │
└───────────┬─────────────┘  └──────────────────┬───────────────────┘
            │ build DOM via el()                 │
            ▼                                     │
┌──────────────────────────────────────────────────────────────────┐
│  render() (`index.html:1809`)                                     │
│  Full teardown of #app, rebuild via vLoad/vLogin/vOB/vMain,       │
│  restores focus/scroll, strips emoji, i18n translate pass         │
└───────────────────────┬────────────────────────────────────────--┘
         │ persistence calls
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  DB wrapper (`index.html:897`)  →  localStorage (`dltate:*` keys) │
│  Local-first: DB.load/save/del, `_ls` safe-localStorage shim      │
└───────────────────────┬────────────────────────────────────────--┘
         │ best-effort background sync (fire-and-forget)
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Firebase Realtime Database (`RTDB`, `index.html:906-907`)        │
│  users/<key>/profile · accounts/<key> · sh/gang/<code> ·          │
│  friends/ · friendReqs/ · notifs/                                 │
└──────────────────────────────────────────────────────────────────┘

External (optional, network only when AI Coach used):
┌──────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker AI proxy (`worker/anthropic-proxy.js`)         │
│  Backend fallback chain: Groq → Anthropic key → Workers AI (free) │
│  Browser calls `fetch(AI_PROXY,...)` or direct Anthropic API      │
│  (`anthropicFetch`, `index.html:299-301`) if user supplies a key  │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `S` global state | Single source of truth for entire UI (view, nav, profile, logs, drafts, chat, onboarding, admin) | `index.html:1625` |
| `render()` | Full re-render entry point: clears `#app`, dispatches to the current view, restores focus/scroll, i18n/emoji post-processing | `index.html:1809` |
| `el()` | Hyperscript-style DOM builder (attrs, event props, children) — replaces JSX/templates | `index.html:1213` |
| View functions (`v*`) | Pure-ish functions that read `S` and build a DOM subtree for one screen/section | `index.html` (e.g. `vDash:2517`, `vNutr:2838`, `vSport:3388`, `vProgr:3299`, `vGang:4057`, `vTop:3915`, `vAI:4362`, `vProf:4923`, `vRewards:4800`, `vAdmin:4626`) |
| `DB` | Local persistence facade over `localStorage`; also fans out profile writes to Firebase (`cloudProfileSync`) | `index.html:897` |
| `RTDB` (Firebase) | Cloud sync/multiplayer data store: accounts, per-user profile mirror, clan (`gang`) shared state, friends, notifications | `index.html:905-936`, scattered `RTDB.ref(...)` calls throughout |
| `bootAccount()` | Session bootstrap: reconciles cloud vs local profile on load/login | `index.html:1351` |
| `I18N` / `t()` | Static translation dictionaries (ro/en) plus a "Bombardier" (bom) personality-mode overlay | `index.html:1656` (`I18N`), `t()` right after |
| AI Coach (`vAI`, `anthropicFetch`, `AI_PROXY`) | Chat UI + calls either the Cloudflare Worker proxy or a direct Anthropic key stored in `S.anthropicKey` | `index.html:4362` (view), `index.html:292-301` (fetch layer) |
| `worker/anthropic-proxy.js` | Cloudflare Worker: shared AI backend selection (Groq/Anthropic/Workers AI), rate limiting, CORS | `worker/anthropic-proxy.js` |
| `android/`, `ios/` | Capacitor-generated native shells that wrap the same `index.html` as a WebView app | `android/app/src/main`, `ios/App/App/public` |

## Pattern Overview

**Overall:** Single-file, framework-free SPA using an immediate-mode-style full-tree re-render on every state change (similar in spirit to a hand-rolled React without virtual DOM diffing — the entire `#app` subtree is torn down and rebuilt each `render()` call).

**Key Characteristics:**
- No build step, no bundler, no framework — one `<script>` block inside `index.html` is the whole app.
- State lives in one global object `S`; there is no reducer/action pattern — handlers mutate `S` directly then call `render()`.
- DOM is rebuilt from scratch every render (not diffed); manual focus/selection/scroll-position preservation logic compensates for this (`index.html:1826-1861`).
- Persistence is local-first: every write goes to `localStorage` synchronously via `DB.save`, with Firebase RTDB sync as a best-effort, non-blocking side effect (`DB.save` for `profile` key triggers `cloudProfileSync()`, `index.html:899`).
- Real-time multiplayer features (clan/gang) use Firebase `.on('value', ...)` listeners that call `render()` directly on remote changes (`setupGangListener`, `index.html:1638`), bypassing the normal event-handler-driven render trigger.
- Two "modes" (normal / "bom" = Bombardier personality) swap out navigation labels, copy, and goal/achievement text arrays at render time (`ACT`/`GOALS`/`NAV`/`OBS` reassigned each render, `index.html:1817-1820`).

## Layers

**State layer (`S`):**
- Purpose: holds all UI/app state — current view/nav tab, user profile, logged metrics (food/workouts/water/sleep/measurements/photos), social data (friends, gang/clan, notifications), draft form inputs, AI chat history, admin/session flags.
- Location: `index.html:1625` (declaration), mutated throughout view/handler code.
- Depends on: nothing (plain object).
- Used by: every view function and every event handler.

**View layer (`v*` functions):**
- Purpose: render one screen or section into a DOM subtree using `el()`; read from `S`, write DOM event handlers that mutate `S` and call `render()`.
- Location: `index.html`, functions named `v<Screen>` (`vLogin:1700`, `vLoad:1871`, `vOB:1895` [onboarding], `vMain:2140` [app shell/sidebar/nav], `vDash:2517`, `vNutr:2838`, `vStat:3078`, `vProgr:3299`, `vSport:3388`, `vChal:3486`, `vFriends:3554`, `vNotif:3685`, `vAch:3730`, `vTop:3915`, `vGang:4057`, `vAI:4362`, `vAdmin:4626`, `vRewards:4800`, `vProf:4923`).
- Depends on: `S`, `el()`, `ic()` (icon helper), `t()`/`L()` (i18n), calculation helpers (`Calc`, `getXP`, `getLvl`, etc.).
- Used by: `render()` dispatch.

**DOM builder layer (`el()`):**
- Purpose: create elements, wire style/class/event props, append children without a template engine.
- Location: `index.html:1213`.
- Depends on: raw `document.createElement`.
- Used by: all view functions.

**Persistence layer (`DB` + `_ls`):**
- Purpose: local-first key/value storage under `dltate:` prefix, with in-memory fallback when `localStorage` is unavailable (e.g. `data:` URL contexts), plus shared-cloud helpers (`ldSh`/`svSh`/`lsSh`) for gang data.
- Location: `index.html:884-903`.
- Depends on: `localStorage`, `RTDB`.
- Used by: profile/log CRUD throughout view and handler code.

**Cloud sync layer (Firebase RTDB):**
- Purpose: cross-device profile sync, authentication-lite (username/password hash in `accounts/`), social features (friends, friend requests, notifications), and clan/gang shared leaderboard + activity feed.
- Location: init at `index.html:905-907`; usage scattered — account/session functions `index.html:971-1061`, `bootAccount:1351`, gang listener `setupGangListener:1638`, XP publishing `publishXP` (referenced `index.html:1286`).
- Depends on: Firebase compat SDK (`firebase-app-compat.js`, `firebase-database-compat.js` loaded at `index.html:283-284`).
- Used by: login/registration, profile screen, gang/clan screen, friends/notifications screens, leaderboard (`vTop`).

**AI integration layer:**
- Purpose: chat-based AI coach and nutrition-photo scanning.
- Location: `AI_PROXY`/`aiProxyOn`/`anthropicFetch` (`index.html:292-301`), chat UI `vAI` (`index.html:4362`), key management in `vProf` (`index.html:5074-5079`).
- Depends on: either the deployed Cloudflare Worker (`worker/anthropic-proxy.js`) or a user-supplied Anthropic API key stored via `DB.save('anthropicKey', ...)`.
- Used by: `vAI` chat screen, nutrition photo scan flow (`index.html:1555-1562`).

## Data Flow

### Primary Request Path (user interaction → persisted state)

1. User interacts with a rendered element; its `click`/`inp`/`change`/`kd`/`blur` handler (wired in `el()`, `index.html:1213-1224`) fires.
2. Handler mutates `S` directly (e.g. `S.nav=n.id`, pushes to `S.food`, etc.) — see nav button handlers in `vMain` (`index.html:2160`).
3. Handler calls `DB.save(key, value)` for anything that must persist (`index.html:899`); if `key==='profile'`, this also fires `cloudProfileSync()` unless `S._suppressCloudSync` is set.
4. Handler calls `render()` (`index.html:1809`) to reflect the new state; `render()` clears `#app` and rebuilds via the current `S.view`/`S.nav` dispatch.

### Cloud Sync / Multiplayer Flow

1. On login/session-restore, `bootAccount()` (`index.html:1351`) fetches `users/<key>/profile` from `RTDB`, reconciles against the local `DB.load('profile')` copy (cloud wins if names differ; clears stale local logs), then calls `_enterApp(...)`.
2. Ongoing gameplay data (XP, level) is periodically pushed via `publishXP`-style writes to `accounts/`/`sh/gang/<code>` (`index.html:1286`, `1291`).
3. Clan/gang membership uses a live Firebase listener: `setupGangListener(code)` (`index.html:1638`) attaches `ref.on('value', ...)` and directly repopulates `S.gangMembers`/`S.gangMeta`/`S.gangFeed`, then calls `render()` — this is the one place render is triggered outside a user-initiated handler.
4. Social actions (friend requests, clan invites) write directly to `RTDB` paths (`friends/`, `friendReqs/`, `notifs/`) via inline `.onclick` handlers, e.g. `index.html:3590-3648`.

**State Management:**
- No reducer/store abstraction; `S` is mutated in place everywhere. Consistency relies on discipline (mutate then `render()`) rather than framework guarantees.
- `_renderEpoch` (`index.html:1813`) is incremented each render to help async callbacks detect stale renders (pattern to look for when adding async handlers).

## Key Abstractions

**View functions (`v*`):**
- Purpose: represent one logical screen/section as a pure DOM-producing function of `S`.
- Examples: `vDash` (dashboard), `vNutr` (nutrition log), `vSport` (workouts), `vGang` (clan), `vAI` (chat coach), `vAdmin` (admin patch tools), `vRewards` (XP shop/wagers/power-ups).
- Pattern: `function vX(){ var ...=el(...); ...; return root }` — no JSX, manual `el()` composition.

**`el()` DOM builder:**
- Purpose: single point for creating DOM nodes with attributes/styles/handlers and appending children (including arrays and conditionally-falsy children which are skipped).
- Examples: used in every view function, thousands of call sites.
- Pattern: `el(tag, propsObjOrNull, ...children)`.

**`I18N` / `t()` / `L()`:**
- Purpose: static bilingual (ro default, en) string tables plus a "Bombardier" (`bom`) alternate-voice overlay selected via `S.mode`.
- Examples: `index.html:1656` onward (`I18N` object), `t(key)` helper right after.
- Pattern: `t('key')` looks up `I18N[S.lang][key]`, falls back to `I18N.ro[key]`, then to `key`; `_bom` suffix keys override in Bombardier mode.

## Entry Points

**Page load / bootstrap IIFE:**
- Location: end of script, `index.html:5141-5158`.
- Triggers: script execution on page load (no `DOMContentLoaded` guard needed — script is at end of `<head>`/before `</body>` content, `S.view` starts as `'loading'`).
- Responsibilities: calls `render()` once immediately (shows loading spinner via `vLoad`), then checks for a cached session (`dltate:session` in localStorage); if present and password hash validates against `RTDB.ref('accounts/...')`, calls `bootAccount()`; otherwise falls back to `S.view='login'` and re-renders. Offline case trusts the cached session.

**`bootAccount()`:**
- Location: `index.html:1351`.
- Triggers: successful session restore, or after login/registration.
- Responsibilities: reconciles cloud (`RTDB users/<key>/profile`) vs local profile, decides whether to wipe stale local logs, then calls `_enterApp(...)` or routes to onboarding.

**`render()`:**
- Location: `index.html:1809`.
- Triggers: called explicitly after essentially every state-mutating event handler, and by the gang Firebase listener on remote data changes.
- Responsibilities: full re-render of `#app` based on `S.view`/`S.nav`; view dispatch: `loading→vLoad`, `login→vLogin`, `onboarding` or missing profile `→vOB`, else `→vMain` (which internally switches on `S.nav` to show dashboard/nutrition/sport/etc. subviews).

**Cloudflare Worker entry (`worker/anthropic-proxy.js`):**
- Location: `worker/anthropic-proxy.js`.
- Triggers: HTTP POST from the browser's `fetch(AI_PROXY, ...)` call (`index.html:300`) when `AI_PROXY` is configured.
- Responsibilities: selects an AI backend (Groq → Anthropic → Cloudflare Workers AI), enforces `ALLOWED_ORIGIN`/`MAX_TOKENS`/`DAILY_CAP`, proxies the chat/vision request so no API key ships to the browser.

## Architectural Constraints

- **Threading:** Single-threaded browser event loop; all Firebase calls are async (Promise-based `.then`/`.catch`) and non-blocking; no Web Workers used for app logic (only the Cloudflare "Worker" which is a separate server-side edge function, not a browser Worker).
- **Global state:** `S` is the sole global mutable state object (`index.html:1625`); other module-level singletons include `RTDB` (Firebase handle), `DB`/`_ls` (storage), `UID`/`PCODE` (device identity), `CR`, `I18N`, `NUM_CONSTRAINTS`, `TOP_PRIZES`, `DEMO_CLANS`, `AI_PROXY`. All are declared with `var` at script top-level, so anything in the single `<script>` block can read/write them.
- **No module system:** everything is in one global scope inside one `<script>` tag — no ES modules, no `import`/`export`. Adding new code must avoid name collisions with existing top-level `function`/`var` declarations.
- **Full-DOM rebuild cost:** `render()` destroys and rebuilds the entire `#app` subtree on every state change (`index.html:1826-1830`), which is why manual focus/scroll-position/selection restoration exists (`index.html:1826-1861`). New interactive elements that need to preserve focus across renders must be discoverable by `id`, or by tag+placeholder+value fallback, per the existing pattern.
- **Local-first with best-effort cloud sync:** cloud writes (`RTDB.ref(...).set/.update`) are generally fire-and-forget with `.catch(function(){})` swallowing errors — the app must remain usable offline; do not assume cloud writes succeed synchronously.

## Anti-Patterns

### Direct mutation without guard against concurrent renders

**What happens:** Handlers mutate `S` and call `render()` synchronously; async callbacks (Firebase `.then`, `fetch` for AI) also mutate `S` and call `render()` later, with no check that the view hasn't since navigated away, other than the informal `_renderEpoch` counter which isn't consistently checked by every async callback.
**Why it's wrong:** Can cause stale async responses to clobber newer state or repaint an inactive view.
**Do this instead:** When adding new async flows (AI chat replies, cloud fetches), capture `_renderEpoch` before the async call and compare on resolution before mutating `S`/calling `render()`, matching the existing pattern where it is used (`index.html:1813`).

### God-object global state with no encapsulation

**What happens:** Every screen reads and writes directly into the single `S` object with no getters/setters or validation; e.g. onboarding draft fields (`S.ob.*`), form drafts (`S.fmeal`, `S.manF`, `S.mIn`), and persisted domain data (`S.food`, `S.progress`) live side-by-side in the same object.
**Why it's wrong:** No enforced boundary between transient UI draft state and persisted domain state; easy to accidentally persist a draft field or forget to reset one, and to introduce naming collisions as `S` grows.
**Do this instead:** When adding new state, follow the existing naming convention (draft/input fields get short abbreviated names like `wIn`, `slH`, `mIn`; persisted collections are full words like `food`, `workouts`) and only pass persisted-domain fields to `DB.save`.

## Error Handling

**Strategy:** Defensive `try/catch` wrapping almost every non-trivial block, especially around DOM manipulation, localStorage access, and Firebase calls; failures are usually swallowed silently (`catch(e){}`) to keep the render loop alive.

**Patterns:**
- `render()` itself wraps the view-dispatch call in try/catch and falls back to an inline error message in `#app` on failure (`index.html:1831-1835`).
- Firebase calls almost always end in `.catch(function(){})` — errors are not surfaced to the user; offline behavior is achieved by falling back to local data (see `bootAccount`'s `.catch`, `index.html:1370-1372`).
- `_ls` (`index.html:887-891`) wraps every `localStorage` call in try/catch with an in-memory fallback store, so the app functions inside sandboxed contexts (e.g. `data:` URLs) where `localStorage` throws.

## Cross-Cutting Concerns

**Logging:** `console.error`/`console.warn` used ad hoc in catch blocks for debugging (e.g. `index.html:1815`, `1835`); no structured logging or remote error reporting.
**Validation:** Numeric input constraints centralized in `NUM_CONSTRAINTS` (`index.html:1109`); otherwise validation is inline per-field in view/handler code (no shared validation library).
**Authentication:** Custom lightweight scheme — username/password hash stored in `accounts/<key>` in Firebase (`_hashPw`, session cached in `localStorage` under `dltate:session`); no third-party auth provider.

---

*Architecture analysis: 2026-07-13*
