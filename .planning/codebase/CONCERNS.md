# Codebase Concerns

**Analysis Date:** 2026-07-13

## Tech Debt

**Client-side-only authentication (not secure):**
- Issue: Passwords are "hashed" with `btoa` (base64 encoding, trivially reversible), not a real hash. Anyone with the encoded string (e.g., visible in Firebase RTDB data or devtools) can decode it directly.
- Files: `index.html:980` — `function _hashPw(u,p){try{return btoa(unescape(encodeURIComponent(u+':'+p)))}catch(e){return btoa(u+':'+p)}}`
- Impact: All user passwords are effectively stored in plaintext (base64 is encoding, not encryption/hashing). Any read access to the RTDB (or a network capture) exposes credentials.
- Fix approach: Move auth to Firebase Authentication (email/password or anonymous+claims) or at minimum use a real KDF (e.g., PBKDF2/bcrypt) server-side via the Worker; never derive security from client-side encoding.

**Hardcoded admin gate:**
- Issue: Admin privileges are granted by a hardcoded username string comparison, not a role/claim stored in a trust boundary the client can't forge.
- Files: `index.html:3842` `function isAdmin(){return !!S.authUser&&S.authUser.toLowerCase()==='cemebeu';}`; enforced again in UI at `index.html:4619`, `index.html:4655`, `index.html:4664`, `index.html:4704`.
- Impact: Because this check runs entirely client-side, any user can locally patch `S.authUser` or the `isAdmin` function via devtools to unlock the admin panel UI. Actual data protection depends entirely on Firebase RTDB security rules (not present in this repo, so their strictness is unverified from the codebase alone) — if rules permit writes based on client-declared identity, this is a full privilege-escalation vector.
- Fix approach: Enforce admin-only writes via RTDB security rules keyed off a real Firebase Auth UID/custom claim, not a username string the client can control.

**Firebase config embedded in client (expected, but rules-dependent):**
- Issue: `apiKey`, `databaseURL`, `projectId`, etc. are inline in `index.html:905`. This is normal for Firebase web apps (the API key is not a secret), but it means *all* real security must come from RTDB rules, which are not part of this repo and were not verifiable during this scan.
- Files: `index.html:905`
- Impact: If RTDB rules are permissive (e.g., `.read`/`.write: true` or rules that trust client-supplied `username` fields), any visitor can read/write all user data, XP, admin patches, etc.
- Fix approach: Audit and commit Firebase RTDB rules (e.g., to `worker/` or a `firebase/` config dir) so they're versioned and reviewable; add UID-based rules instead of trusting client fields.

**Active theme migration left inconsistent (uncommitted "Dark Forest" repaint):**
- Issue: The `:root` CSS custom-property palette was switched from an "ember" (warm orange) theme to a "Dark Forest" (green) theme, but numerous hardcoded colors elsewhere in the file were not updated and still reference the old ember palette. `git status` shows `index.html` modified but uncommitted, so this is a known in-progress/incomplete change.
- Files/evidence:
  - `index.html:12-29` — new `:root` block, accent is now `--ac:#3e9d63` (green), header comment literally says `/* Accent: forest pine ... */`.
  - `index.html:18` — **malformed CSS comment**: `\* Accent: forest pine (calm, not neon) */` uses a stray backslash instead of `/*` to open the comment. Because there's no matching open delimiter, this text may be treated as invalid CSS by strict parsers/linters (browsers tend to silently recover, but this is fragile and should be fixed to `/* Accent: ... */`).
  - `index.html:214-216` — `.scal-cell.s1/s2/s3` streak-calendar heat cells still hardcode `rgba(232,99,44,...)` (ember orange) instead of referencing `var(--ac)`.
  - `index.html:1475` — share-card canvas gradient hardcodes `#e8632c` → `#fbbf24` (ember → gold) instead of using the current theme accent.
  - `index.html:2754` — chart/legend items hardcode `rgba(232,99,44,.52)` for the "Parțial" (partial) legend swatch.
  - `index.html:4724` — the default cosmetic accent preset (`COSMETIC_ACCENTS`, id `'emerald'`... but named `Ember`/`Jar`) hardcodes `ac:'#e8632c'`, `acl:'#ff9d6b'`, `glow:'rgba(232,99,44,.16)'` — note the preset's internal `id` is `'emerald'` while its display name is `'Ember'`/`'Jar'`, a leftover naming mismatch from the palette swap.
- Impact: UI currently shows mixed green (`--ac`) and orange (hardcoded ember `#e8632c`/`rgba(232,99,44,...)`) accents simultaneously — visually inconsistent theme. The streak calendar, share-card export image, chart legend, and default cosmetic swatch will look like they belong to a different (older) theme than the rest of the app.
- Fix approach: Replace all hardcoded `#e8632c` / `rgba(232,99,44,...)` / `#fbbf24` occurrences with `var(--ac)` / `var(--ac-l)` / `var(--ac-glow)` (or intentionally-chosen new Dark Forest equivalents), and fix the `COSMETIC_ACCENTS` `'emerald'` preset's colors/name to match the new palette. Grep for `e8632c` and `232,\s*99,\s*44` before considering the theme migration complete.

**Single 5,164-line monolithic file:**
- Issue: All application logic — state, rendering, auth, admin panel, charts, canvas share-card generation, i18n, cosmetics, achievements — lives in one file, `index.html` (5,164 lines).
- Files: `index.html` (entire file)
- Impact: High risk of merge conflicts, difficult code navigation, no module boundaries, harder to reason about side effects between unrelated features (e.g., theme colors, admin logic, and chart rendering are all interleaved).
- Fix approach: Not urgent for a PWA of this size, but if growth continues, consider splitting into ES modules (auth.js, render.js, charts.js, admin.js, i18n.js) served via a lightweight bundler, while preserving the no-build, single-file-deploy simplicity if that's a hard requirement.

**Full-DOM clear-and-rebuild on every render:**
- Issue: `render()` removes every child of `#app` and rebuilds the entire view tree from scratch on each call (no virtual DOM / diffing).
- Files: `index.html:1809-1841`, specifically the clear loop at `index.html:1826-1831` (`while(r.firstChild)r.removeChild(r.firstChild)`, falling back to `r.innerHTML=''`) followed by full re-append of `vLoad()`/`vLogin()`/`vOB()`/`vMain()`.
- Impact: This is an inherent performance ceiling — every state change (even a single XP increment) tears down and rebuilds all DOM nodes, including expensive subtrees like charts and the admin user list. `render()` also manually reimplements focus preservation (`index.html:1825`, `1843+`) and nav-scroll preservation (`index.html:1823`) to work around this, which is itself a maintenance burden. On lower-end mobile devices this can cause visible jank on every interaction.
- Fix approach: Introduce targeted DOM patching for hot paths (e.g., only re-render the active view/section instead of the whole `#app`), or adopt a minimal diffing helper. Not urgent unless users report lag; the current focus/scroll-preservation hacks are a sign this is already a felt pain point.

**Custom safe-localStorage wrapper duplicates responsibility with error boundary:**
- Issue: A hand-rolled `DB` wrapper (`index.html:884-891`) falls back to an in-memory store (`_lsMem`) when `localStorage` is unavailable (e.g., in `data:` URL contexts, private browsing, or quota-exceeded states), and a separate global error handler explicitly ignores errors mentioning `'localStorage'` or `'data:'` (`index.html:250`, `277`).
- Files: `index.html:250`, `index.html:277`, `index.html:884-891`
- Impact: When storage is unavailable, the app silently degrades to in-memory-only persistence (data lost on refresh) with no user-facing warning. Combined with localStorage being the primary/only local store (see Scaling Limits below), this is a silent data-loss path.
- Fix approach: Surface a non-blocking banner when `_lsOk` is false so users know their local progress won't persist across sessions.

## Known Bugs

**Malformed CSS comment in `:root` block:**
- Symptoms: A CSS comment on `index.html:18` opens with `\*` instead of `/*`. This is invalid CSS comment syntax.
- Files: `index.html:18`
- Trigger: Always present; visible on any page load if a strict CSS parser/linter is run against the inline `<style>` block.
- Workaround: None currently; most browsers appear to tolerate/ignore the malformed token in practice (no visual break observed in the surrounding rules), but this should not be relied upon.

**`COSMETIC_ACCENTS` preset id/name mismatch:**
- Symptoms: The default (free, cost 0) cosmetic accent preset has `id:'emerald'` but is displayed to users as `name:{en:'Ember', ro:'Jar'}`, and its colors are the old ember orange, not emerald/green.
- Files: `index.html:4724`
- Trigger: Always present when a user opens the cosmetics/accent picker; the preset labeled with an "emerald" internal id shows an orange (ember) swatch named "Ember."
- Workaround: None; purely a leftover from the incomplete Dark Forest theme migration described above.

## Security Considerations

**Weak/reversible password storage:**
- Risk: `btoa`-encoded credentials (`index.html:980`) are not cryptographically hashed; anyone who can read the RTDB user records can trivially recover plaintext passwords, which is especially damaging since users likely reuse passwords across services.
- Files: `index.html:980`
- Current mitigation: None (base64 provides zero protection).
- Recommendations: Move to Firebase Authentication or a server-side hash (bcrypt/argon2/PBKDF2) computed in the Worker, never in client JS.

**Admin authorization is a client-side string check:**
- Risk: See Tech Debt above — `isAdmin()` (`index.html:3842`) is trivially bypassable client-side; real protection depends entirely on unverified RTDB security rules.
- Files: `index.html:3842`, `index.html:4619-4704`
- Current mitigation: Unknown/unverifiable from this repo — Firebase RTDB rules are not checked into the codebase.
- Recommendations: Commit RTDB rules to the repo (e.g., `firebase.rules.json`) so they can be reviewed and kept in sync with the client's assumptions; gate all admin writes server-side (rules or a Worker endpoint) using Firebase Auth UID, not username string equality.

**Worker CORS allows configurable/open origin:**
- Risk: `worker/anthropic-proxy.js:27` sets `Access-Control-Allow-Origin` from an `allowOrigin` variable that can be `'*'`; if misconfigured in `wrangler.toml`/environment, the AI proxy endpoint could be called cross-origin by any site, potentially abusing the shared AI credits/keys.
- Files: `worker/anthropic-proxy.js:22-30`, `worker/wrangler.toml`
- Current mitigation: `allowOrigin` appears to be an env-configurable value (worth confirming it's pinned to the app's real origin in production, not left as `'*'`).
- Recommendations: Verify `ALLOWED_ORIGIN` (or equivalent) is set to the exact production origin in `wrangler.toml`/Cloudflare dashboard, not left as wildcard.

## Performance Bottlenecks

**Whole-app re-render on every state mutation:**
- Problem: See Tech Debt — `render()` (`index.html:1809`) tears down and rebuilds the entire `#app` subtree on every call, including chart canvases and long lists (e.g., admin user list, leaderboards).
- Files: `index.html:1809-1857` (full function), heavy consumers likely include chart-drawing and leaderboard/admin list views built inside `vMain()`.
- Cause: No incremental DOM diffing; imperative `el()`-based DOM construction rebuilt from scratch each time.
- Improvement path: Scope re-renders to the active view/panel only, or cache/reuse canvas-based chart elements across renders instead of recreating them.

## Fragile Areas

**Focus and scroll-position preservation hacks around full re-render:**
- Files: `index.html:1823-1825`, `index.html:1842+` (focus restore block following the render)
- Why fragile: These are manual workarounds compensating for the destroy/rebuild render strategy. Any new input-bearing view added to `vMain()`/`vOB()` needs to be manually compatible with this focus-restore logic (matched by `id`, then by tag/placeholder/value fallback) or users will lose their cursor position/typed text mid-edit.
- Safe modification: When adding new form inputs, always give them a stable `id` so the existing focus-restore logic (`index.html:1846`) can find them by id first.
- Test coverage: None — no automated tests exist in this repo (see Test Coverage Gaps).

**Theme color system: CSS variables mixed with hardcoded hex/rgba throughout the file:**
- Files: `index.html:214-216`, `1475`, `2754`, `4724` (see Tech Debt for full list)
- Why fragile: Because many colors bypass the `--ac`/`--ac-l`/`--ac-glow` custom properties, any future theme change requires manually grepping the whole file for stray hex codes rather than editing the `:root` block once.
- Safe modification: Always reference `var(--ac)` and friends for anything accent-colored; grep for raw hex/rgba accent-like values before shipping a theme change.
- Test coverage: None; purely visual, would benefit from a manual QA checklist (or at minimum a documented "theme colors must all route through CSS variables" convention).

## Scaling Limits

**localStorage as the primary/fallback data store:**
- Current capacity: Browser localStorage is typically capped around 5–10MB per origin, and is per-device (not synced without the Firebase RTDB layer).
- Limit: Users with large histories (long workout logs, achievements, chat history if any) risk hitting quota limits, at which point `DB.set` (`index.html:890`) silently falls through to `try/catch` swallowing the `QuotaExceededError` with no user feedback, and the safe wrapper's `_lsOk` in-memory fallback (`index.html:887-891`) means writes could silently stop persisting.
- Scaling path: Treat Firebase RTDB as the source of truth and localStorage purely as an offline cache with visible sync-status UI, rather than a store that can silently and invisibly fail to save.

**No pagination on RTDB reads (unverified but worth checking as data grows):**
- Not directly confirmed by this scan, but the admin panel iterates the full user list (`index.html:4619+`) and demo/seed users are defined inline (`index.html:3809-3816`) — as real user counts grow, unpaginated full-list reads/renders will scale linearly with user count and could slow both network fetch and the full-DOM re-render described above.

## Dependencies at Risk

**No package manager / no lockfile / no build step:**
- Risk: The app has no `package.json`, `node_modules`, or bundler config in the repo root — all JS is inline ES5-style code in `index.html`, and Firebase is presumably loaded via CDN `<script>` tag(s) (version pinning should be verified directly in the `<head>` script tags).
- Impact: Firebase SDK version drift is invisible until something breaks in production; there is no automated way to know when a CDN-pinned SDK version is deprecated or has a security patch.
- Migration plan: Not urgent for a no-build PWA, but pin exact Firebase SDK versions in the `<script src>` URLs and periodically review them; consider documenting the pinned version in `STACK.md`.

## Test Coverage Gaps

**No automated tests anywhere in the repo:**
- What's not tested: Everything — authentication/password hashing, admin gating, XP/achievement calculations, chart rendering, i18n string coverage, theme application, localStorage fallback logic.
- Files: No `*.test.*`, `*.spec.*`, test runner config, or `package.json` found in the repository.
- Risk: Any refactor (e.g., finishing the in-progress theme migration, or hardening auth) has no safety net; regressions can only be caught by manual QA.
- Priority: High — especially before touching auth/admin logic (`index.html:980`, `3842`) given the security concerns above.

**Runtime dictionary-based localization has no completeness check:**
- What's not tested: The `L(en, ro)` helper (`index.html:1100`) requires every call site to manually supply both an English and Romanian string inline; there is no central translation table and no automated check that every UI string has both variants filled in (or that new strings aren't accidentally left English-only/Romanian-only).
- Files: `index.html:1100` and all call sites using `L(...)`
- Risk: Silent partial-localization gaps (a string shown correctly in one language but falling back to a mismatched/missing translation in the other) are only caught by manually switching the language toggle and eyeballing every screen.
- Priority: Medium — cosmetic/UX issue, not a functional break, but directly affects the "design-conscious" bar for polish.

---

*Concerns audit: 2026-07-13*
