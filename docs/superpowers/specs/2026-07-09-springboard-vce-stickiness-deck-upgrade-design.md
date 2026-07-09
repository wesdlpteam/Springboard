# Springboard — VCE study guides, automatic stickiness, deck polish

**Date:** 2026-07-09
**Project:** Springboard (all-subject fork of Digital Spotlight), `Apps/Springboard`
**Status:** Design approved (verbal), ready for implementation plan

## Summary

Three independent improvements to Springboard, approved together:

1. **Automatic "Made to Stick".** Remove the teacher-facing stickiness booster chips. Bake the *Made to Stick* principles into every generation as standing guidance, so teachers never choose them.
2. **VCE study guides.** When the class is set to VCE and Year 11 or 12, the free-text Subject box becomes a dropdown of the 50 VCE subjects (grouped by learning area). Picking a subject makes the backend load that subject's condensed curriculum card and feed it to the model, so the deck is aligned to the real VCE study design. Year 11 → Units 1–2; Year 12 → Units 3–4.
3. **Deck polish.** Rebuild the PowerPoint export to one polished Wesley look, matching the craft of the Digital Spotlight "Classic" deck, applied to Springboard's four slides (Ignite · Think · Launch · Reflect).

Digital Spotlight (`Apps/Tech Spotlight Generator`) is the **quality benchmark** for item 3 and is **not** changed by this work.

## Context (current Springboard state)

- Single `index.html` (React + Babel in-browser). Client builds the whole OpenAI prompt.
- `api/generate.js` is a **thin proxy**: it receives `{ messages, response_format, ... }`, adds `OPENAI_API_KEY`, forwards to OpenAI. It does no prompt building today.
- Class settings (`index.html` ~line 2137): Curriculum `<select>` (`CURRICULA`, includes `"VCE"`), Subject free-text `<input>`, Year level free-text `<input>`, Outcome optional `<textarea>`.
- Stickiness boosters: `BOOSTERS` array (~line 855); `boostersOn` Set state; `toggleBooster`; chips rendered under a "Make it stick" heading in the Analyse step (~line 2210). The Analyse call recommends 2–3 boosters and auto-selects them; `boosterIds` flow into `generateSpringboard` and become the `Stickiness requirements:` prompt lines (~line 1196).
- Deck shape: `title, keywords, ignite{question}, think{routine,steps,structure}, launch{connection,bridge,question}, reflect{revisit,prompts}, notes{...}, advisory{flag,reason}`.
- Export: `buildDeckBlob` (~line 1768) — Wesley purple/gold, Arial, crest, wordmark, page numbers, one layout. Honours the pptxgenjs "mutates shadow/options" trap (every call gets a fresh object literal).
- Study designs live **outside** the repo at `…/Ai Training Docs/VCE-Study-Designs/md/` — 50 subject `.md` files (27 KB–306 KB each) plus `_manifest.md` (name → file → VCAA source URL). Far too large to inject whole (Biology ≈ 25k tokens; Maths ≈ 76k).

## Part 1 — Automatic "Made to Stick"

**Goal:** stickiness quality is always on; no teacher control surface.

**Remove**
- The "Make it stick" heading + booster chips block in the Analyse step (~lines 2210–2218).
- `boostersOn` state, `setBoostersOn(...)` calls, `toggleBooster`.
- `boosterIds` param + `boosterLines` in `generateSpringboard`; the `boosters` recommendation in the Analyse function (parse/return/auto-select) and its mention in the Analyse system prompt.
- `boosters` field in `logEvent` calls.

**Add**
- A constant guidance block, always inserted where `Stickiness requirements:` currently is. Content = the *Made to Stick* SUCCESs frame as writing instructions (Simple core, Unexpected hook, Concrete language, Credible detail, Emotional stake, Story shape) tuned for a lesson-launch deck. ~5–8 lines.

**Keep:** thinking-routine recommendation + selection (unchanged). Generate stays gated on a chosen routine.

**Done when:** no booster UI anywhere; JSX compiles (Babel classic preset); a normal generation still produces a full deck; no dangling `booster*` references.

## Part 2 — VCE study guides

### 2a. Condensed curriculum cards (one-time content build)

Distil each of the 50 study designs into a small **curriculum card**, written by Claude directly from the source `.md` (no OpenAI cost). Store as `api/guides/<key>.md`, bundled with the Vercel functions.

Each card (~300–500 words) contains, in plain text:
- Subject name + a one-line scope/rationale.
- **Units 1–2** and **Units 3–4** sections, each listing: Area of Study titles, the outcome statements (plain language), key knowledge themes, key skills.
- A short cross-study / key-skills note if it materially shapes lessons.
- No copyright front-matter, ISBNs, assessment-weighting tables, or contact boilerplate.

Faithfulness rule: cards paraphrase/extract only — no invented content, codes, or outcomes. Spot-check several against source.

`key` = manifest filename stem (e.g. `biology`, `mathematical-methods`).

### 2b. Subject list for the dropdown (client)

Add a small `VCE_SUBJECTS` array to `index.html`: 50 entries `{ key, name, learningArea }`, derived from `_manifest.md`. Grouping (VCAA-style) for `<optgroup>`:

- **The Arts:** Dance, Drama, Music, Theatre Studies, Art Creative Practice, Art Making and Exhibiting, Media, Visual Communication Design
- **English:** English and EAL, English Language, Literature, Foundation English, Bridging EAL
- **Mathematics:** Foundation Mathematics, General Mathematics, Mathematical Methods, Specialist Mathematics
- **Science:** Biology, Chemistry, Environmental Science, Physics, Psychology
- **Humanities:** Accounting, Business Management, Economics, Industry and Enterprise, Legal Studies, Classical Studies, Geography, History, Philosophy, Politics, Religion and Society, Sociology, Texts and Traditions
- **Health & Physical Education:** Health and Human Development, Outdoor and Environmental Studies, Physical Education
- **Technologies:** Agricultural and Horticultural Studies, Food Studies, Product Design and Technologies, Systems Engineering, Algorithmics (HESS), Applied Computing
- **VCE VM:** Literacy, Numeracy, Work Related Skills, Personal Development Skills
- **Cross-disciplinary:** Extended Investigation, Structured Workplace Learning Recognition for VET

### 2c. UI behaviour

- Condition: `curriculum === "VCE"` **and** year level is `11` or `12`.
- When true, replace the Subject free-text `<input>` with the grouped `<select>`; store the chosen subject `key` (and keep its display name for the deck/export). When false, the field stays free-text exactly as now.
- Optional Outcome textarea stays visible in both cases: with a guide loaded it *narrows* within the study design; with no guide it behaves as today.

### 2d. Backend injection (API contract change)

- Client sends an extra field with the generate request: `studyGuide: { key: "<subjectKey>", units: "1-2" | "3-4" }` (`units` derived from year: 11 → `1-2`, 12 → `3-4`). Omitted when the VCE-Y11/12 condition isn't met.
- `api/generate.js`: if `studyGuide` is present **and** `key` is in a server-side allowlist (the set of files in `api/guides/`), read `api/guides/<key>.md`, optionally slice to the requested Units section, and **append it to the system message** (last `role:"system"` entry) before forwarding. Unknown/missing key → ignore silently and forward unchanged (graceful degrade to current behaviour).
- **Security:** only keys matching `^[a-z0-9-]+$` that exist in the allowlist are read; never join arbitrary input into a path. This prevents path traversal.
- **Vercel bundling:** ensure `api/guides/**` ships with the function (co-locate under `api/`, read via `path.join(__dirname, "guides", key + ".md")`; add `includeFiles` in `vercel.json` if the bundler prunes them).

**Prompt change:** in `generateSpringboard`, when a study guide is in play, the launch/connection instruction references "the provided VCE study-design extract" (units + areas of study) and aligns to it; the pasted Outcome, if any, narrows further. Keep "never invent official codes."

**Alternative considered (rejected):** client fetches the card from a static path and injects it itself (backend stays a pure proxy). Simpler, but puts 50 curriculum files on the static site, requires a static-site redeploy to update a study design, and contradicts the "load in the backend" intent. Kept as a fallback only if Vercel file-bundling proves impractical.

**Done when:** setting VCE + Year 11 + Biology and generating yields a deck whose Launch/connection reflects Biology Units 1–2 areas of study/outcomes; the backend logs/loads the right card; unknown key degrades gracefully; non-VCE flows are untouched.

## Part 3 — Deck polish (one look)

Rebuild `buildDeckBlob` to the craft level of Digital Spotlight's "Classic" skin, applied to Springboard's four slides:

- **Cover / Ignite:** large confident display title, a kicker line (`SPRINGBOARD · <subject> · Year <n>`), brand crest, generous margins, disciplined purple/gold; stimulus framed cleanly (reuse existing image/video-embed/QR paths).
- **Think / Launch / Reflect:** consistent section chrome (purple top rule, small crest, wordmark, page number already exist) but with a stronger, more deliberate type scale, clearer captions/labels, and better spacing rhythm matching the benchmark.
- Preserve: Arial (portable-embeddable), advisory + reflect toggles, media/QR logic, teacher-notes pane content, and the **fresh-object-literal-per-call** discipline (no shared shadow/options — see `pptxgenjs-mutates-shadow`).

Reference the Digital Spotlight `buildDeckBlob` Classic path during implementation for exact spacing/type decisions; do not copy its 4-slide structure (Springboard's slides differ).

**Done when:** an exported `.pptx` opens cleanly in desktop PowerPoint, reads as on-par with a Digital Spotlight Classic deck, and passes an openability check with no corruption.

## Build order

1. Part 1 (client-only, smallest).
2. Part 2a — write the 50 cards.
3. Part 2b–2d — dropdown + contract + backend injection + prompt wiring.
4. Part 3 — export rebuild.

## Verification

- **Compile:** JSX compiles via `@babel/standalone` (classic React preset) after each client change.
- **Live generate:** run the app against the backend (or `vercel dev`) and generate a real deck for a VCE case and a non-VCE case.
- **Backend injection:** unit-check that a known key appends the card and an unknown key forwards unchanged; confirm the allowlist/regex blocks traversal.
- **Export:** produce a `.pptx` and open it in PowerPoint (COM oracle) — confirm it opens, looks right, no shadow-reuse corruption.

## Risks / notes

- **Vercel file bundling** is the main technical risk (Part 2d) — mitigation above; client-fetch fallback exists.
- **Token cost:** each injected card is ~400 words, negligible per call. One-time card authoring costs no OpenAI (Claude writes them). OpenAI monthly spend cap remains the cost backstop.
- **Copyright:** condensed VCAA study-design summaries used inside a Wesley teacher tool sit within VCAA's educational allowance (internal school use).
- **Card freshness:** cards are a point-in-time distillation; `_manifest.md` records each source URL/version for later refresh.
