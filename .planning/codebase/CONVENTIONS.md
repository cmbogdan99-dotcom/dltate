# Coding Conventions

**Analysis Date:** 2026-07-13

## Overview

This is a single-file vanilla JS PWA: `index.html` (~5,164 lines) contains all HTML, CSS, and JavaScript in one document. There is no build step, no bundler, no transpiler, and no framework (no React/Vue/etc.). Code is written in an ES5-leaning style (`var`, `function` expressions, `.bind`-free callbacks) even though it runs in modern evergreen browsers — this appears to be a deliberate choice for simplicity/copy-paste portability rather than a compatibility requirement.

Related smaller files: `worker/anthropic-proxy.js` (Cloudflare Worker, also plain JS, no build step) and `wrangler.toml` (deploy config).

## Naming Patterns

**Functions:**
- `camelCase`, verb-first: `getXP()`, `spendXP()`, `syncUserToFB()`, `pushClanEvent()`, `setupGangListener()`
- Short, single-purpose helpers get terse 2-3 letter names when used pervasively: `el()` (DOM element builder), `ic()` (icon), `L()`/`B()`/`bom()` (translation helpers), `fmtD()` (format date)
- Private/internal helpers prefixed with `_`: `_lsMem`, `_lsOk`, `_ls`, `_normTxt()`, `_trPat()`, `_feedLine()`, `_checkPassedYou()`, `_gangUnsub`

**Variables:**
- `camelCase` for locals: `kcal`, `bfDeur`, `xpBalance`
- Global singletons in `UPPERCASE` or short caps: `S` (app state), `DB` (storage wrapper), `RTDB` (Firebase realtime DB ref), `UID`, `PCODE`, `TODAY`, `EN_DICT`, `EN_TOKENS`, `ACH_DEF`
- Constants/definition tables are `UPPER_SNAKE` or `UpperCamel` arrays: `ACH_DEF`, `EN_DICT`

**Files:**
- Everything lives in `index.html`. No per-feature file split. New features are added as new functions/sections within the same file, not new files.

## Code Style

**Formatting:**
- No Prettier/ESLint config present in the repo — style is manual/consistent-by-convention, not enforced by tooling.
- Extremely compact: multiple statements per line, minimal blank lines, dense one-liners for render functions (e.g. `mkGauge()` at `index.html:1231`, `notify()` at `index.html:1210` — a ~1,400-character single-line function body).
- Semicolons used inconsistently (many lines omit trailing `;` before `}`), consistent with a "works in browsers, don't fuss over it" style. Do not "clean up" semicolons/formatting in unrelated lines when editing — keep diffs minimal (see `.claude` memory: avoid global find/replace on this file, it corrupts string literals).
- 2-space indentation where indentation exists, but many function bodies are single long lines with no internal indentation.

**Linting:**
- No `.eslintrc*`, no `package.json` lint script tied to `index.html`. `package.json` (if present) is for Capacitor/Cordova native wrapper tooling only, not for the web app's JS.

## DOM Building — `el()` Helper

All UI is built imperatively via a single helper, `el(tag, props, ...children)` (`index.html:1213`). This is the dominant UI-construction pattern across the codebase — new UI must use it, not manual `document.createElement` chains.

```javascript
function el(t,p){
  var e=document.createElement(t);
  var a=[].slice.call(arguments,2);
  if(p){var ks=Object.keys(p);for(var i=0;i<ks.length;i++){var k=ks[i],v=p[k];switch(k){
    case 'c':e.className=v;break;
    case 's':e.style.cssText=v;break;
    case 'click':e.onclick=v;break;
    case 'kd':e.onkeydown=v;break;
    case 'blur':e.onblur=v;break;
    case 'change':e.onchange=v;break;
    case 'disabled':if(v)e.disabled=true;break;
    case 'type':e.type=v;break;
    case 'val':e.value=v;break;
    case 'ph':e.placeholder=v;break;
    case 'id':e.id=v;break;
    case 'step':e.step=v;break;
    case 'min':e.min=v;break;
    case 'max':e.max=v;break;
    default:e.setAttribute(k,v);
  }}}
  // ...wires p.inp (oninput) with try/catch, appends variadic children (arrays flattened, null/false skipped)
}
```

Usage example pattern: `el('div',{c:'card',s:'padding:10px'}, el('span',{},'Label'), el('button',{click:onClick},'Go'))`.

Prop shorthand keys to reuse: `c` (className), `s` (style.cssText), `click`, `inp` (oninput, auto try/catch-wrapped), `kd` (keydown), `blur`, `change`, `val`, `ph` (placeholder), `id`, `disabled`, `type`, `step`, `min`, `max`. Anything else falls through to `setAttribute`.

Icons use `ic(name, size)` (`index.html:1230`), which returns `<i class="ti ti-{name}">` (Tabler Icons font).

## Bilingual Copy Helpers

The app supports EN/RO output and two "mode" flavors (normal RO vs. "BOM" — a slang/informal RO variant). Three helper functions drive all user-facing copy:

- `L(en, ro)` (`index.html:1100`) — returns `en` if `S.lang==='en'`, else `ro`.
- `B(en, roNormal, roBom)` (`index.html:1103`) — like `L`, but when RO + `S.mode==='bom'` and a bom variant is supplied, returns that instead.
- `bom(normal, bomVariant)` (`index.html:1096`) — returns `bomVariant` only when `S.mode==='bom'`, else `normal` (mode-only, language-agnostic).

Use these directly inline wherever copy is authored: `el('div',{},L('Total','Total'))`, `el('span',{},B('Great job!','Bravo!','Nasol de bine!'))`. Do not hardcode language-specific strings without going through one of these three helpers — new user-facing text must pick the correct one based on whether it varies by language, by mode, or both.

**Runtime dictionary translation (secondary layer):** For text authored directly in Romanian/HTML without `L()`/`B()`, a DOM-walking translator patches text nodes after render when `S.lang==='en'`:
- `EN_DICT` — exact-phrase lookup table (normalized key → English string)
- `EN_TOKENS` — ordered regex/string replacement pairs applied to any leftover un-mapped text
- `translateTree(root)` (`index.html:1195`) — walks `root`'s text nodes via `TreeWalker`, skips `SCRIPT`/`STYLE`/`TEXTAREA`, applies `EN_DICT` then `EN_TOKENS`; also patches `placeholder` attributes on inputs/textareas.

When adding new hardcoded-Romanian UI text that should also be translatable, add an entry to `EN_DICT` (or a pattern to `EN_TOKENS`) rather than relying on `translateTree` to guess — untranslated strings silently fall through unchanged.

## Error Handling

**Dominant pattern: try/catch-swallow.** Nearly every side-effecting operation (localStorage access, Firebase calls, DOM manipulation inside callbacks, event handlers) is wrapped in `try{...}catch(e){}` with the error silently discarded (or occasionally `console.error(ex)` inside deeply nested handlers, e.g. `el()`'s `inp` wrapper at `index.html:1222`). This is intentional defensive coding for a PWA that must never hard-crash the render loop, not an oversight — but it means bugs can fail silently. When debugging, do not assume a `catch(e){}` block means "no error occurred"; add a temporary `console.error(e)` while diagnosing, then remove it.

```javascript
// Typical pattern — localStorage guarded, in-memory fallback
get:function(k){if(_lsOk){try{return localStorage.getItem(k)}catch(e){}}return _lsMem[k]!==undefined?_lsMem[k]:null}

// Typical pattern — Firebase call, no user-visible failure path
DB.svSh:function(k,v){RTDB.ref('sh/'+k.replace(/:/g,'/')).set(v).catch(function(){})}

// Typical pattern — render-safety wrapper around a listener callback
ref.on('value',function(snap){ /* ... */ try{render()}catch(e){} });
```

**User-facing errors:** surfaced via `notify(title, body, ttl, action, type)` (`index.html:1210`), a toast system — not via thrown exceptions or alert(). Use `notify(...)` for anything the user needs to see (achievement unlocks, save failures, sync warnings), and keep it wrapped in the same try/catch-swallow style as its call sites.

## Storage & Persistence — `DB` Wrapper

All persistence goes through the `DB` object (`index.html:897`), never raw `localStorage` calls, and never raw Firebase calls from feature code:

- `DB.load(key)` / `DB.save(key, val)` / `DB.del(key)` — local persistence (via the `_ls` safe-localStorage shim, prefixed `dltate:`), returning Promises for `load`.
- `DB.save('profile', ...)` has a side effect: it automatically triggers `cloudProfileSync()` unless `S._suppressCloudSync` is set — be aware that saving the profile key is not "just local," it also fires a network sync.
- `DB.ldSh(key)` / `DB.svSh(key, val)` / `DB.lsSh(prefix)` — shared/cloud data via Firebase Realtime Database (`RTDB`), path-mapped from `key` by replacing `:` with `/`.
- Underlying `_ls` (`index.html:888`) is a resilient localStorage shim: probes availability once at load (`_lsOk`), falls back to an in-memory object (`_lsMem`) when localStorage is blocked (e.g., `data:` URLs, strict private browsing) — surfaces a one-time toast warning via `notify()` in that case.

When adding a new persisted field, add it under a new/existing `DB` key rather than introducing a parallel storage mechanism.

## CSS Theming — Custom Properties

Theming (dark/light + purchasable accent colors) is driven entirely by CSS custom properties defined on `:root` (`index.html:12`) and overridden per theme/accent class:

- Base palette: `--bg`, `--bg1`, `--bg2`, `--bg3`, `--bd` (borders), `--tx1`..`--tx4` (text tiers), `--su`/`--wa`/`--er` (success/warn/error).
- Accent (purchasable/themeable): `--ac`, `--ac-h` (hover), `--ac-l` (light variant), `--ac-glow`, `--ac-glow2`.
- Light theme overrides the same variable set under a light-mode selector (`index.html:31`).
- All component CSS references these variables (`var(--bg1)`, `var(--ac)`, etc.) rather than hardcoded colors — new UI/components must follow suit so both themes and all purchasable accents render correctly without extra code.
- Runtime color reads (e.g. inside `mkGauge()`, `index.html:1238`) pull values via `getComputedStyle(document.documentElement).getPropertyValue('--bg2')` with a hardcoded fallback literal — follow this pattern when JS needs to know a theme color (e.g., for `<canvas>`/`<svg>` drawing where CSS vars don't apply directly).

## App State

- Single global mutable state object `S` holds session/user state (`S.lang`, `S.mode`, `S.profile`, `S.nav`, `S.doneChals`, `S.xpLog`, etc.). Read/write it directly; there is no reducer/action-dispatch layer.
- `render()` (`index.html:1809`) is the central re-render entry point — call it after mutating `S` or persisted data to reflect changes in the DOM. Most async callbacks wrap their `render()` call in `try{}catch(e){}`.

## Function Design

- Functions are generally short (a handful of lines) except render/builder functions, which are frequently one very long line composing nested `el(...)` calls — this is idiomatic for this file, not a smell to refactor away without cause.
- Parameters: plain positional args, no destructuring/defaults in the ES6 sense; defaults handled manually (`ttl=ttl||4200`).
- Return values: plain objects/arrays; async work returns native `Promise` (via `new Promise(function(res){...})`) or the Firebase-native promise-like objects — no `async`/`await` in the core app code.

## Comments

- Sparse. Used mainly as section dividers (`// ── XP economy ──...──`) and to explain non-obvious side effects or safety shims (e.g., the localStorage fallback block at `index.html:884`, `getXP()` vs `xpBalance()` distinction at `index.html:1253`).
- No JSDoc/TSDoc usage anywhere — this is untyped JS with no type annotations or doc-comment tooling.

---

*Convention analysis: 2026-07-13*
