# Technology Stack

**Analysis Date:** 2026-07-13

## Languages

**Primary:**
- JavaScript (ES5/ES6 mix, vanilla, no transpilation) — `index.html` (~5164 lines: inline `<style>` CSS + inline `<script>` JS, no build step)

**Secondary:**
- CSS (inline `<style>` block in `index.html`, custom properties for theming — "Ember on Graphite" theme)
- HTML5 (single-page shell in `index.html`)

## Runtime

**Environment:**
- Browser (client-side only) — PWA installed as a single static HTML file, no Node runtime required to run the app
- Node.js used only for the local dev static server (`npx serve`) and for Capacitor/Cordova tooling in `android/`, `ios/`

**Package Manager:**
- npm (implied by `node_modules/`, Capacitor plugin folders in `android/app`, `ios/App`)
- No `package.json` / `package-lock.json` present in the repo (both are explicitly listed in `.gitignore`, along with `capacitor.config.json`) — dependency versions are not pinned/tracked in git; `node_modules` exists locally but is untracked

## Frameworks

**Core:**
- None — no React/Vue/Angular. Hand-written vanilla JS with custom `el()`-style DOM builder helpers and a manual `render()` re-render loop, all inside `index.html`

**Mobile shell:**
- Capacitor (`@capacitor`, `@capawesome`, `@ionic` packages present in `node_modules`) — wraps the PWA for native Android (`android/`) and iOS (`ios/`) builds
- `capacitor-health-connect` plugin present (Android Health Connect integration)

**Charting:**
- Chart.js 4.4.1 (CDN) — `index.html:282` `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js`

**Testing:**
- None detected — no test framework, test files, or test scripts found

**Build/Dev:**
- No bundler/transpiler (no webpack/vite/esbuild config found) — `index.html` is served as-is
- Dev server: `npx serve -p 3456 -s .` launched via `.claude/launch.json` (VS Code/Claude debug launch config)

## Key Dependencies

**Critical:**
- Firebase Realtime Database compat SDK 10.12.0 (CDN, `index.html:283-284`) — sole backend/data store, loaded via `firebase-app-compat.js` and `firebase-database-compat.js`

**Infrastructure:**
- Cloudflare Workers (`worker/anthropic-proxy.js`, `worker/wrangler.toml`) — optional shared AI proxy deployed separately from the main app, Git-connected Cloudflare deploy
- Tabler Icons webfont (CDN, `index.html:8`) — `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css`
- Google Fonts — Noto Sans + Sora (CDN, `index.html:10`)

## Configuration

**Environment:**
- No `.env` files — all config is inline in `index.html` (Firebase config object `_fbCfg` at `index.html:905`) or entered by the user at runtime and persisted via `localStorage`/Firebase (e.g. Anthropic/OpenAI API keys saved through `DB.save('anthropicKey', ...)`)
- Cloudflare Worker config (secrets/vars: `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `ALLOWED_ORIGIN`, `MAX_TOKENS`, `DAILY_CAP`) configured via Cloudflare dashboard or `worker/wrangler.toml`, not committed as secrets

**Build:**
- No build config files (no `tsconfig.json`, `.babelrc`, `webpack.config.js`, etc.)
- `worker/wrangler.toml` — Cloudflare Worker deployment config (name `dl-siski-ai`, `main = anthropic-proxy.js`, `[ai]` binding for free Cloudflare Workers AI)
- `.claude/launch.json` — local dev server launch config (`npx serve -p 3456 -s .`)

## Platform Requirements

**Development:**
- Any static file server (`npx serve` used in this repo) — no build/compile step required for the web app
- Node.js + npm only needed for Capacitor native builds (`android/`, `ios/`) and Cloudflare Worker deployment (`wrangler`)

**Production:**
- Deployed as a static PWA (single `index.html`) to any static host
- Native wrappers: Android (Gradle project in `android/`) and iOS (Xcode project in `ios/`) via Capacitor
- Optional Cloudflare Worker deployment for the shared AI proxy (Git-connected, per `worker/README.md`)

---

*Stack analysis: 2026-07-13*
