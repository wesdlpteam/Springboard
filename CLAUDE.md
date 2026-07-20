# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Springboard turns a teacher-supplied stimulus (image, video, PDF, text, or link) into an editable 4-slide PowerPoint (IGNITE → THINK → LAUNCH → REFLECT) built on a Project Zero Thinking Routine. Frontend is a single static `index.html` on GitHub Pages; backend is Vercel serverless functions in `api/` proxying OpenAI; analytics live in a Neon Postgres `events` table.

## Commands

```bash
npm test                          # backend unit tests (node --test, test/*.test.js)
node --test test/lib.test.js      # run a single test file
npm run check:ui                  # compile gate: inline JSX in index.html through Babel
npx vercel dev                    # serve index.html + api/* locally (reads .env)
node tools/stats-stub.mjs         # fake /api/stats for stats.html work (STUB_EMPTY=1 for empty state)
node tools/build-ac-guides.mjs    # regenerate api/guides/ac-*.md from ACARA data
```

**Both `npm test` and `npm run check:ui` must pass before every commit/push.** There is no other CI safety net for the frontend — `check:ui` is the only thing that catches JSX syntax errors before they hit production.

## Deployment model (affects every change)

- Work is committed **straight to `main`** — no feature branches. A push auto-deploys both halves (GitHub Pages serves the repo root; Vercel redeploys `api/`).
- Bump the `APP_VERSION` const in `index.html` (~line 676) on every user-visible deploy so the cache refresh can be confirmed in the footer.
- The repo is public. Never commit secrets; all keys live in Vercel env vars (`OPENAI_API_KEY`, `TEACHER_PASSCODE`, `ADMIN_PASSWORD`, `DATABASE_URL`). See `docs/DEPLOY.md` for full setup.

## Architecture

### Frontend: one big file, no build step

`index.html` (~300 KB) contains the entire React app inside a single `<script type="text/babel">` block, compiled in-browser by Babel. There is no bundler, no JSX build, no imports — everything is one scope. `stats.html` is a separate, smaller admin dashboard with the same pattern. Third-party libs (PptxGenJS for the .pptx export, pdf.js, JSZip, qrcode-generator) load from CDN with pinned SRI hashes.

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

## Product rules (non-negotiable)

- **Privacy**: no teacher or student identity is ever collected. Analytics events are anonymous (see README "Privacy" for the exact allowed fields). The OpenAI key never reaches the browser.
- **Persistence**: the teacher passcode (`sb_passcode` in localStorage) persists; class settings (`sb_class` — curriculum/subject/year/outcome) must NOT persist across refreshes — fresh start every visit.
- **Design**: Wesley College brand palette only, WCAG 2.2 AA, reduced-motion alternative for every animation. Brand personality and anti-references are in `PRODUCT.md` — playful creative tool, never enterprise-admin grey.
- Feature specs and plans live in `docs/superpowers/` (specs + dated implementation plans).
