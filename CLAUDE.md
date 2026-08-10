# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Springboard turns a teacher-supplied stimulus (image, video, PDF, text, or link) into an editable 4-slide PowerPoint (IGNITE → THINK → LAUNCH → REFLECT) built on a Project Zero Thinking Routine. Frontend is a single static `index.html` on GitHub Pages; backend is Vercel serverless functions in `api/` proxying OpenAI; analytics live in a Neon Postgres `events` table.

## Mandatory Fable → Codex implementation routing (project-wide)

This rule applies to every implementation request in this repository, including follow-up changes and worktree sessions.

- Fable/Claude owns requirements, planning, safety and correctness decisions, review, verification, and the final explanation.
- Codex is the sole implementation writer for changes to application code, tests, configuration, scripts, dependencies, deployment files, and tracked documentation. Fable may directly write planning/specification files under `docs/superpowers/`.
- The moment a request moves from analysis or suggestions into building, implementing, fixing, refactoring, updating, or otherwise changing the repository, invoke the global `codex-worker` skill **before any repository mutation**. A follow-up such as "do all of those" is an implementation request and must trigger the handoff.
- For implementation, always use the skill's **visible background runner** (`run_in_background: true`), not the synchronous Codex MCP call. The background run is what exposes Codex activity in Nathan's Fable chat.
- Tell Nathan as soon as the worker starts. Read the background output/live progress log after meaningful intervals (normally every 30–60 seconds) and post short chat updates saying what Codex has reported: current activity, commands/tests, files changed, or blockers. Never expose or claim hidden chain-of-thought.
- Keep monitoring until the worker reaches a terminal state. A quiet interval is normal; report that it is still running rather than starting another worker. If the runner says `BUSY`, inspect and continue the existing run.
- Use exactly one Codex writer for this project. Resume the same Codex thread for corrections and related follow-ups; never start a second writer because the first looks slow.
- Do not use `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, or a shell-writing workaround to implement changes directly. The project `PreToolUse` hook enforces this one-writer boundary.
- The Codex prompt must include the bounded scope, constraints, acceptance criteria, and required tests. Codex must read `AGENTS.md` and `CLAUDE.md` before editing.
- If `codex-worker` is unavailable or fails, stop and tell Nathan. Do not silently fall back to direct implementation or another writer.
- After Codex returns, inspect the complete diff, run or independently confirm the relevant checks (always `npm test` and `npm run check:ui` before commit/push), and send focused corrections through the same Codex thread if needed.

Read-only discovery, planning, diff review, test execution, committing, deployment, and plain-English reporting remain Fable/Claude responsibilities. Do not try to bypass the hook; invoke `codex-worker` instead.

## Commands

```bash
npm test                          # backend unit tests (node --test, test/*.test.js)
node --test test/lib.test.js      # run a single test file
npm run check:ui                  # compile gate: inline JSX in index.html through Babel
npm run audit                     # full system audit: ~1000 assertions across three suites
npm run audit:static              # data, recipes, security, privacy, prompt rules (no browser, fast)
npm run audit:deck                # exports four real decks headless, asserts on the .pptx XML
npm run audit:ui                  # accessibility + contrast sweep, 4 scenes x 4 window shapes
npm run audit:live                # SPENDS MONEY: 29 real lessons, F-12, against the deployed backend
npm run audit:live:rerun          # same, reusing the already-downloaded stimulus pack
npx vercel dev                    # serve index.html + api/* locally (reads .env)
node tools/stats-stub.mjs         # fake /api/stats for stats.html work (STUB_EMPTY=1 for empty state)
node tools/build-ac-guides.mjs    # regenerate api/guides/ac-*.md from ACARA data
```

**Both `npm test` and `npm run check:ui` must pass before every commit/push.** There is no other CI safety net for the frontend — `check:ui` is the only thing that catches JSX syntax errors before they hit production.

## Deployment model (affects every change)

- Work is committed **straight to `main`** — no feature branches.
- **The two halves deploy differently. Pushing does NOT deploy the backend.**
  - Frontend (`index.html`, `about.html`, `stats.html`, `assets/`): GitHub Pages serves the repo root and updates automatically on push.
  - Backend (`api/`): Vercel is **not** connected to the GitHub repo. It only publishes when someone runs `vercel --prod` (project is already linked via `.vercel/`). Verified 2026-07-25 after `/api/guide` sat undeployed for 8 days while `main` looked correct, breaking the curriculum focus picker with "couldn't load the curriculum list".
- **After any change under `api/`, deploy it and then verify it:**
  ```bash
  vercel --prod --yes                                  # publish the backend
  curl -i -X OPTIONS https://springboard-dlp-s-projects.vercel.app/api/<endpoint>
  ```
  A deployed function answers OPTIONS with 200; a missing one returns 404, identical to a nonexistent path. The Vercel deployment also serves `index.html`, so fetching it and reading `APP_VERSION` tells you exactly which commit is live. Never assume an `api/` change is live because it was pushed.
- A push touching backend files runs a no-secrets freshness check; it alerts but never deploys.
- Run `npm run check:backend` to compare the deployed and local `APP_VERSION` from the terminal.
- Bump the `APP_VERSION` const in `index.html` (~line 676) on every user-visible deploy so the cache refresh can be confirmed in the footer.
- The repo is public. Never commit secrets; all keys live in Vercel env vars (`OPENAI_API_KEY`, `TEACHER_PASSCODE`, `ADMIN_PASSWORD`, `DATABASE_URL`). See `docs/DEPLOY.md` for full setup.

## Architecture

### Frontend: one source file, checked-in precompile

`index.html` (~300 KB) contains the entire React app inside one non-executing inline source block. `npm run check:ui` compiles that classic-script scope to hash-paired `assets/app.js`; a small loader uses pinned-SRI Babel only if the artifact cannot be trusted or fetched. There is no bundler, module wrapper or imports — everything stays in one classic-script scope. `stats.html` remains a separate, smaller admin dashboard compiled in-browser. Third-party libs (PptxGenJS for the .pptx export, pdf.js, JSZip, qrcode-generator) load from CDN with pinned SRI hashes.

The frontend auto-targets `http://localhost:3000` for API calls when opened from `localhost`/`127.0.0.1`/`file:`, so local dev needs no code changes.

### Backend: `api/` serverless functions

Shared plumbing is in `api/_lib.js`; every endpoint follows the same gate sequence:

1. `applyCors(req, res)` — origin allowlist (also handles OPTIONS)
2. `requireTeacher` (checks `x-sb-passcode` header) or `requireAdmin` (`x-sb-admin`) — both use `safeEqual` (constant-time, fails closed on empty). `requireTeacher` passes open when `TEACHER_PASSCODE` is unset (deliberate "open mode").
3. `rateLimit(req, res, {max, windowMs, name})` — best-effort in-memory per-warm-instance throttle; the OpenAI spend cap is the real cost backstop.

Any new endpoint must follow this pattern. Endpoints: `generate.js` (OpenAI proxy for analyse/generate), `transcribe.js` (audio/video → text), `log.js` (append one anonymous analytics event), `stats.js` (admin-only aggregates), `youtube-meta.js`, `fetch-post-media.js` (link import).

### Curriculum grounding (`studyGuide` contract)

`api/generate.js` accepts a `studyGuide` field and injects the matching curriculum extract from `api/guides/*.md` into the last system message, server-side:

- VCE: `{key, units}` where `units` is `"1-2"` or `"3-4"` — slices the matching `## Units` section.
- Australian Curriculum F–10: `{key: "ac-*", level}` — `sliceAcLevel` picks the `##` section for the year level.

Keys are guarded by an allowlist regex (`^[a-z0-9-]+$`) plus a path-prefix check so client input can never traverse the filesystem. Unknown/unmatched input silently leaves messages unchanged. `vercel.json` ships `api/guides/**` with the generate function via `includeFiles`.

The OpenAI model is **hard-pinned** in `api/generate.js` with no env override — a deliberate product decision (always the flagship tier). Don't add an `OPENAI_MODEL` env var.

`injectStickiness` appends the Made to Stick SUCCESs guidance only when the client sends `stickiness: true` (generation calls, not analyse calls).

### Tests

`test/` uses the built-in Node test runner with `_helpers.js` mock req/res. `api/_lib.js` exposes test seams (`__setNowForTests`, `__resetRateLimit`) — use them rather than real timers.

### `npm run audit:live` (costs real OpenAI spend — run deliberately)

The other audits stub the model. This one doesn't: it serves `index.html` on `http://localhost:3000` (an allowed CORS origin — a `file://` page sends `Origin: null` and every call fails), points the app's `API_BASE` at the deployed backend with a fetch shim, and calls the app's **own** `analyseStimulus` → `generateSpringboard` from CDP. Babel-standalone injects a classic script, so every module-scope function resolves by bare name; nothing is reimplemented, so the prompts are exactly production's.

It builds one lesson per config in `tools/audit-live-configs.mjs` — every year level F–12 across AC, VCE, IB MYP and IB DP, with real photos and videos from Wikimedia Commons and real articles from The Conversation. `audit-live-report.mjs` then asserts on the decks (word limits, notes sections, band pitch) and verifies **every AC9 code against the real guide file for that exact year level**, so an invented or wrong-level code fails. `audit-live-viewer.mjs` writes `.audit-live/lessons.html` for reading the output as a teacher would.

Everything lands in the gitignored `.audit-live/`, one JSON per lesson, so a killed run resumes (set `FORCE=1` to regenerate, `ONLY=id,id` for a subset). Roughly 50s per lesson, 4 headless browsers in parallel.

## Product rules (non-negotiable)

- **Privacy**: no teacher or student identity is ever collected. Analytics events are anonymous (see README "Privacy" for the exact allowed fields). The OpenAI key never reaches the browser.
- **Persistence**: the teacher passcode (`sb_passcode` in localStorage) persists; class settings (`sb_class` — curriculum/subject/year/outcome) must NOT persist across refreshes — fresh start every visit.
- **Design**: Wesley College brand palette only, WCAG 2.2 AA, reduced-motion alternative for every animation. Brand personality and anti-references are in `PRODUCT.md` — playful creative tool, never enterprise-admin grey.
- Feature specs and plans live in `docs/superpowers/` (specs + dated implementation plans).
