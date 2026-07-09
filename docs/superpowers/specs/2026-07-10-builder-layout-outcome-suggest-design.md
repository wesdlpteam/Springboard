# Springboard — full-width builder, AI outcome suggestions, fresh start, field order

Date: 2026-07-10. Approved by Nathan (chat). Four changes, all front-end except one new
client→existing-backend AI call. Version bump v0.3.10 → v0.4.0.

## 1. Outcome field: paste OR AI suggestions

Class settings' "Outcome or topic" field gains a two-way choice (same visual pattern as the
stimulus-mode toggle, smaller):

- **Paste from planner** — the current textarea, unchanged behaviour. Default.
- **AI suggestions** — a "Suggest connections" button. Enabled when subject + year level are
  filled (stimulus optional but included when present — same media-parts packaging as
  `analyseStimulus`). Calls `POST /api/generate` (existing endpoint, key server-side) with
  `response_format: json_object`, asking for ~4 curriculum connections:
  `{"suggestions":[{"outcome": string, "why": string} x4]}`.
  - VCE Y11/12 with recognised study: pass `studyGuide: vceStudyGuide(classInfo)` so the
    server injects the real study-design extract; prompt instructs to quote real areas of
    study/outcomes, never invent codes (mirrors existing outcomeLine rules).
  - Non-VCE: plain-language connections for curriculum+subject+year; no invented codes.
  - Results render as clickable cards (reuse routine-card styling). Clicking one writes its
    text into `classInfo.outcome` (the same state the generator reads) and shows it in the
    editable textarea so the teacher can tweak. Re-suggest button allowed. Errors inline
    (same alert pattern as analyse).
- Switching tabs never clears an already-chosen outcome.

## 2. Full-width builder; preview only after Generate

- State: `previewOpen` = `loading || Object.keys(spots).length > 0` (i.e. Generate clicked
  and not yet cleared). No persistence.
- Before Generate: `.layout` gets class `pre` → single column, full width. Inside the input
  panel, content splits into an internal two-column grid: LEFT = stimulus mode + media/article
  + title; RIGHT = class settings + analyse + generate button + errors. Sticky positioning off
  in this state.
- The "Your Springboard preview appears here" empty-state panel is deleted (never shown).
- After Generate (or while generating): current behaviour exactly — `380px 1fr`, input panel
  sticky left, preview right.
- ≤980px: everything stacks single-column as today, both states.

## 3. Fresh start on refresh

- Remove `sb_class` localStorage persistence: `loadClassInfo()` returns the fallback
  (`IB MYP`, blanks); `saveClassInfo` no longer writes storage; on boot, remove any stale
  `sb_class` key so old machines are cleaned.
- Teacher passcode persistence stays (explicit earlier request).

## 4. Field order

Class settings order becomes: Curriculum → Year level → Subject → Outcome. (Year before
Subject also reads better because VCE + Y11/12 turns Subject into the fixed study picker.)

## Non-goals

No backend changes. No new persistence. No change to generation prompts/decks beyond the
outcome text a suggestion writes into the existing field.

## Verification

- `npm test`, `npm run check:ui` green.
- Browser: fresh load → full-width builder, no preview panel, blank class settings;
  Year level above Subject; outcome tabs switch; AI suggestions return clickable options
  (mock/real); Generate → layout flips to left-planning/right-preview; refresh → blank again.
