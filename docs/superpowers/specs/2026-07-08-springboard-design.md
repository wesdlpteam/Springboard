# Springboard — Design

**Date:** 2026-07-08
**Status:** Approved pending user review
**Origin:** Fork of Tech Spotlight Generator (`wesdlpteam/Digital-Spotlight`), generalised for all subjects.

## What it is

Springboard turns a teacher-selected stimulus (image, video, PDF, Word doc, PowerPoint, pasted text, or web link) into a classroom-ready, editable PowerPoint that launches student thinking: a 4-slide arc of **IGNITE → THINK → LAUNCH → REFLECT**, scaffolded by a Project Zero Thinking Routine, sharpened with Made to Stick principles, and bridged to the teacher's curriculum. Target time from stimulus to finished deck: ~2 minutes.

## Users and job to be done

Wesley College classroom teachers (all subjects, Prep–Y12), planning between classes, often non-technical. They arrive with a stimulus and a lesson to teach; they leave with a deck they trust and can run as-is. No API keys, no sign-in — one shared school passcode, remembered by the browser.

## Teacher experience

### Flow (6 steps)

1. **Add stimulus** — image(s), short video, PDF, Word doc (.docx), PowerPoint (.pptx), pasted text, or a web link (QR + fetch-text carried over from Tech Spotlight). SharePoint files arrive via the teacher's synced folders through the normal file picker; no SharePoint integration in-app.
2. **Set the class** — curriculum framework (VCE / IB PYP / IB MYP / IB DP / Australian Curriculum / Custom), subject, year level, optional pasted outcome or topic from the teacher's planner, and language mode (English / Immersion + language picker: Wesley's taught languages first, plus Other).
3. **Analyse** — the model reads the stimulus and returns the **top 3 recommended Thinking Routines** as cards, each with a one-line "why this fits" rationale. Teacher picks one, or browses the full routine list (source: `docs/pz-thinking-routines.md`, carried over from Tech Spotlight).
4. **Stickiness boosters** — 2–3 recommended Made to Stick strategies shown as on/off toggles, on by default (drawn from the SUCCESs checklist: e.g. curiosity-gap title, concrete question, lead with the story, unexpected fact, human-scale statistic).
5. **Generate** — editable 4-slide preview. Every field editable in place; any single slide regenerable on its own (carried over).
6. **Download PowerPoint** — a real editable `.pptx` saved to the teacher's computer. No SharePoint save.

### The four slides

Minimal on-slide text, highly visual. All detailed guidance goes in the **Notes pane** of every slide: facilitation script, suggested timings, differentiation ideas, curriculum links, discussion extensions.

| Slide | Content |
|---|---|
| **IGNITE** | Bold title (stickiness-boosted), the stimulus itself (embedded image(s)/video, or QR + link for articles), one provocative question. |
| **THINK** | The chosen Thinking Routine's steps as short student prompts, plus the discussion structure (pairs / whole class). |
| **LAUNCH** | Curriculum connection, a bridge sentence from stimulus to today's lesson, and the lesson launch question. |
| **REFLECT** | Used at lesson end. Revisits the IGNITE question and runs a short closing routine ("I used to think… Now I think…"). **On by default, toggle to exclude.** |

Optional content-advisory slide (model flags sensitive themes; teacher chooses) — carried over, Phase 2.

### Curriculum alignment (Option C, with fallback)

The teacher supplies the target: framework + subject + year level via dropdowns, optionally pasting the exact outcome/topic from their planning doc. The AI builds the bridge from stimulus to that target. If nothing is pasted, the AI writes the connection in its own words **without inventing official curriculum codes**.

### Language modes

- **English (default)** — everything in English.
- **Immersion** — all student-facing slide text in the chosen language; Notes-pane teacher guidance always stays in English so any teacher can run the deck.

Bilingual mode: explicitly out of scope.

### Branding

Wesley brand, light touch (option B): fully branded IGNITE slide; content slides clean so stimulus and routine dominate. Brand colours/typography from the Wesley brand kit. Deck-style variants may carry over from Tech Spotlight if they survive the redesign without extra work; not a requirement.

## Architecture

### Frontend

- Single static `index.html` forked from Tech Spotlight: React + Babel in-browser, PptxGenJS, qrcode, JSZip, pdf.js — CDN-pinned with SRI, no build step.
- Hosted on **GitHub Pages** in a new public repo `wesdlpteam/Springboard`.
- New: `.docx` / `.pptx` text extraction in the browser via JSZip (both formats are zip + XML).
- Client-side image downscaling before upload to stay under the backend request-size limit (~4.5 MB Vercel body limit).
- Stats view is part of the same static app (admin-only; see Analytics).

### Backend (Vercel, pattern copied from WiSEQuizGen)

- `api/generate.js` — proxies OpenAI calls (including vision). Model fixed server-side (teachers don't choose). Requires teacher passcode.
- `api/log.js` — receives analytics events, writes to database.
- `api/stats.js` — returns aggregated analytics. Requires admin password; rejects otherwise.
- CORS restricted to the GitHub Pages origin + localhost dev.
- Environment variables (Vercel only, never in repo): `OPENAI_API_KEY`, `TEACHER_PASSCODE`, `ADMIN_PASSWORD`, database connection string.
- Storage: free-tier Postgres attached to the Vercel project (append-only events table).

### Security model

- OpenAI key lives only in Vercel env vars; the public GitHub repo contains no secrets.
- Teacher passcode required on every generate call; entered once, kept in localStorage, changeable server-side at any time.
- Admin password (separate) required for stats; verified server-side — the public stats page is an empty shell until authenticated.
- Origin allowlist as a second layer (acknowledged as bypassable outside browsers — passcode is the real gate).
- Recommended operational backstop: monthly spending cap on the OpenAI key.

## Analytics

- **Events logged:** analyse, generate, regenerate-slide, download. Fields: timestamp, stimulus type, curriculum framework, subject, year level, chosen routine, boosters on/off, language mode, lesson topic.
- **Anonymous by default** — no names, no sign-in, no PII.
- **Stats page:** admin enters password → charts for usage over time, breakdowns by curriculum / subject / routine / stimulus type, and a recent-topics table.

## Build phases

**Phase 1 — usable daily tool**
Fork + rename + strip cyber-safety-specific content; Vercel backend with passcode; 4-slide structure with Notes-pane guidance; guided flow (analyse → routine cards → boosters → generate); curriculum settings (Option C); English only; download-only export; analytics logging + basic admin stats page.

**Phase 2 — the extras**
Immersion mode; Word/PowerPoint input; content-advisory slide; search-keywords polish; stats page polish.

**Later bucket (explicitly deferred)**
Entra ID / Microsoft Graph sign-in (would replace both passcodes and enable per-teacher analytics); SharePoint Online integration via Graph.

## Verification approach

- Exported `.pptx` verified openable via PowerPoint COM automation (known project oracle; also guards the known PptxGenJS shared-shadow-object corruption trap — never reuse one options object across calls).
- Live-path testing in debug Chrome (existing rig).
- Backend tested directly: correct passcode, wrong passcode, missing passcode, oversized payload.
- Accessibility: WCAG 2.1 AA targets carried over from Tech Spotlight (contrast, keyboard-first, focus states, reduced motion).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Endpoint abuse / cost blowout | Teacher passcode + origin allowlist + OpenAI spend cap. |
| Vercel 4.5 MB request limit vs image/video stills | Client-side downscaling/compression before send. |
| AI-invented curriculum codes | Option C: teacher-supplied outcomes; prompt forbids fabricated codes. |
| PptxGenJS corrupt exports | Fresh options objects per call; COM open-check before shipping changes. |
| Public repo leaks | No secrets in repo; keys only in Vercel env. |

## Naming

Product name: **Springboard**. (Considered: Thinking Launch Pad, Lesson Spark, First Five, Hook Line & Thinker.)

## Out of scope (this design)

Bilingual mode; SharePoint save/upload; Entra ID / Graph; per-teacher identity; teacher-name analytics field; multi-school/neutral branding.
