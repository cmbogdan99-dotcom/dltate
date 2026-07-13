# Testing Patterns

**Analysis Date:** 2026-07-13

## Reality Check

There is no automated test suite in this repository. No Jest/Vitest/Mocha/Playwright/Cypress config exists, no `*.test.*`/`*.spec.*` files exist, and `package.json` (Capacitor/Cordova tooling only) has no `test` script wired to `index.html`. This is a single-file (~5,164-line) vanilla-JS PWA with zero build step, so there is nothing to feed a bundler-based test runner without introducing new tooling.

Do not assume a test framework is present or invent test file locations/conventions that don't exist — verify with `Glob "**/*.test.*"` / `Glob "**/*.spec.*"` before referencing tests in a plan.

## What Verification Actually Happens

**1. Syntax validity check (ad hoc, not a committed script).**
Because `index.html` embeds one giant `<script>` block with no build step, a syntax error anywhere breaks the entire app silently in the browser (white screen, console error only). The practical verification technique used in this project is:
- Extract the contents of the main `<script>` tag from `index.html`.
- Run it through Node's `new Function(extractedSource)` (or `node --check` on the extracted block) to catch `SyntaxError`s before shipping.
- This does **not** execute the app (no DOM/`window`/`localStorage`/`firebase` in Node), so it only proves the JS parses — it does not verify runtime behavior, DOM correctness, or logic.
- No such script is currently committed to the repo (checked: no `*check*`/`*test*`/`*.js` syntax-check file at repo root or in `worker/`). If asked to verify a change, recreate this technique inline (e.g., a one-off Node command extracting the script tag and running `node --check`) rather than assuming a pre-existing script file.

**2. Manual browser verification (primary method).**
The overwhelmingly dominant verification method in this codebase is manually opening/reloading `index.html` in a browser (or the Capacitor-wrapped app on Android/iOS) and interacting with the UI. There is no headless browser automation, no snapshot testing, no component testing.

For Claude-driven verification in this environment specifically, the equivalent is: use a browser preview/eval tool to load `index.html`, then execute targeted JS expressions against the live `window`/`S` state to confirm behavior (e.g., call a function directly, inspect `S.profile`, check DOM output of `render()`), rather than writing a test file that will never be run.

## Practical Guidance for Adding/Changing Code Here

- **Before finishing any change to `index.html`:** run the Node syntax-check technique above on the extracted script block. A single missing brace/paren anywhere in this 5,000+ line file breaks the entire app.
- **After a syntax-valid change:** manually exercise the affected feature via browser preview — there is no automated regression safety net, so behavioral correctness relies on direct interaction, not on a green test suite.
- **Do not introduce a test framework unprompted.** Adding Jest/Vitest et al. would require restructuring this file into modules and adding a build step, which is a significant architectural change outside the scope of most tasks — only do this if explicitly asked to.
- **String-literal safety:** when editing translation dictionaries (`EN_DICT`) or copy strings, avoid global find/replace across the file (a documented past failure mode: global `\n` replacement corrupted string literals). Make targeted, scoped edits instead, then re-run the syntax check.
- **New features must be checked in both themes and both languages/modes** (dark/light CSS variables; EN/RO via `L()`/`B()`; normal vs. "BOM" copy variant) since there's no automated coverage to catch a missed variant — this is a manual verification step, not optional polish.
- **New user-facing features must also be reflected in the in-app guided tour** (`tourSteps`) per project convention — verify this alongside functional testing, since nothing else will catch the omission.

## Coverage

**Requirements:** None enforced (no coverage tooling exists).

## Test Types

**Unit Tests:** Not used.
**Integration Tests:** Not used.
**E2E Tests:** Not used.

---

*Testing analysis: 2026-07-13*
