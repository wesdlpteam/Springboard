# Curriculum focus picker — design

**Date:** 2026-07-24
**Status:** Approved (brain experience only; Classic view untouched)

## Problem

The original ("Classic") builder let a teacher pick a **Curriculum → Year → Subject**, and
the Subject field became a smart dropdown: VCE studies for Year 11/12, year-filtered ACARA
subjects for Foundation–Year 10. Choosing a subject silently grounded the generated lesson in
the matching curriculum extract (`studyGuide` contract → `injectStudyGuide` server-side).

The current default **brain / chamber** experience replaced that "Your class" step with three
plain boxes: free-text **Subject**, a **Year** dropdown, and free-text **Learning focus**. It has
no curriculum chooser, and `classInfo.curriculum` is stuck at its default (`"IB MYP"`), which has
no guide. Result: `vceStudyGuide()` / `acStudyGuide()` never fire in the live experience, so the
VCE study designs and ACARA content descriptions are effectively unreachable from the page users
actually see.

Teachers want more than the old silent grounding: they want to **see the specific learning
intentions (VCE Areas of Study) or content descriptions (ACARA), tick the ones a lesson targets**,
have the AI centre the lesson on them, and have those exact links written into their notes so
coverage is provable.

## Goals

1. In the brain experience, make Subject a smart, year-driven picker (no curriculum chooser).
2. After a real subject is chosen, show that subject's curriculum items as a tickable list.
3. Ticked items **focus generation** (hook, routine, launch, reflection centre on them).
4. Ticked items are **written into the LAUNCH teacher notes** (teacher-only, never projected).
5. Ticking is **optional** — skip it and behaviour is today's whole-subject grounding.
6. Keep all product rules: settings don't persist, curriculum stays teacher-only, both test
   gates pass, `APP_VERSION` bumped.

## Non-goals

- No changes to the Classic view (`icol` builder). It keeps its existing smart picker, no tick list.
- No curriculum chooser in the brain flow (Year decides VCE vs ACARA).
- No IB / Custom curriculum item lists (those guides don't exist; not in scope).
- No new persistence — focus selections live in the non-persistent `classInfo`.
- No projected-slide curriculum text (stays in teacher notes only).

## Year → curriculum system rule

| Year level        | System | Guide keys        | Item type              |
|-------------------|--------|-------------------|------------------------|
| Year 11, Year 12  | VCE    | `VCE_SUBJECTS`    | Areas of Study bullets |
| Foundation–Year 10| ACARA  | `AC_SUBJECTS`     | Content descriptions   |

Year 10 stays ACARA (matches existing `isVceSenior` = Y11/12 only, and the guide data:
`ac-*.md` runs to Year 10, VCE guides are Units 1–2 (Y11) / 3–4 (Y12)).

## UI — brain "Your class" step (`index.html`, ~line 3910)

Replace the free-text Subject input. New flow:

1. **Year** dropdown — unchanged (Foundation, 1–12).
2. **Subject** — conditional on Year:
   - Year 11/12 → `<select>` of VCE studies grouped by `area` ("Choose your VCE study…").
   - Foundation–Year 10 → `<select>` of `acSubjectsFor(year)` grouped by `area` ("Choose your subject…").
   - Year blank → Subject disabled with hint "Pick a year first."
   - An **"Other / not listed"** option in each list reverts to a plain text box (unusual subjects,
     VET, cross-disciplinary). No item list in that case — behaves like a free-text subject.
3. **Curriculum focus (optional)** — a collapsible panel that appears only once a *listed* subject
   is chosen. Fetches items for that subject+year, renders grouped checkboxes:
   - ACARA: grouped by sub-strand (`#### heading`), each row shows the code (e.g. `AC9S7U01`) + text.
   - VCE: grouped by unit block, each row is one Area of Study (`Unit 1, AoS2 — …`).
   - Hint: "Tick the ones this lesson targets, or leave blank to cover the whole subject."
   - A loading state while fetching; a soft error line if the fetch fails (never blocks generate).
4. **Learning focus (optional)** free-text stays, for anything beyond the ticked items.

Styling reuses the existing `.bx-*` chamber classes (paper theme, per-move accent). Checkboxes
follow the existing `routine-card`/`bx` visual rhythm. Reduced-motion respected (no new animation).

### State

`classInfo` gains a **`focus`** field: an array of the selected items' `text` strings (exactly
what gets sent to the model and written to notes). The fetched `groups` are held in local component
state (not `classInfo`) purely to render the checkboxes; the checkbox toggles its item's `text`
in/out of `classInfo.focus`, keyed by `id`.
- Non-persistent (inherits `classInfo`'s reset-on-refresh behaviour).
- Cleared whenever Year or Subject changes (a stale tick from another subject must never leak),
  mirroring the existing guard at ~line 2764 that resets `subject` when the picker mode flips.

## Backend — new endpoint `api/guide.js`

A small read-only endpoint returning the parsed item list for one subject+year.

- **Gates (same pattern as every endpoint):** `applyCors` → `requireTeacher` → `rateLimit`
  (`{ max: 30, windowMs: 60000, name: "guide" }`; read-only + cheap, so slightly higher than generate).
- **Method:** POST, body `{ key, level }` (ACARA) or `{ key, units }` (VCE). 405 otherwise.
- **Security:** identical guard to `injectStudyGuide` — `^[a-z0-9-]+$` on `key`, resolve under
  `GUIDES_DIR`, `startsWith(GUIDES_DIR)` + `existsSync`. Unknown/unmatched → `{ items: [] }`, 200
  (never an error path the UI must handle specially).
- **Response:** `{ subject: <title>, groups: [{ heading, items: [{ id, text }] }] }`.
  - `id` = a stable identity used only as the React key / checkbox value: the ACARA code
    (`AC9S7U01`) for ACARA, or a slug of the AoS title for VCE.
  - `text` = the exact human string shown in the checkbox **and** sent to the model / written to
    notes. For ACARA it already includes the code, e.g. `AC9S7U01 — investigate the role of
    classification…`; for VCE it is the AoS title, e.g. `Unit 1, AoS2 — How do plant and animal
    systems function?`. One string, so no id→label resolution is ever needed.

### Shared parsing module

Extract guide reading + slicing into `api/_guides.js` so `generate.js` and `guide.js` share one
copy (small, targeted refactor — no behaviour change to generate):

- `readGuide(key)` → validated file read or `null`.
- `sliceAcLevel(text, yearLevel)` → moved verbatim from generate.js.
- `sliceVceUnits(text, units)` → the inline VCE slice from `injectStudyGuide`, extracted.
- `parseItems(sectionText, kind)` → walk lines: `#### heading` opens a group; `- **CODE:** text`
  or `- **Title:** desc` becomes an item; trailing non-bullet lines (assessment / cross-study)
  are ignored. Returns `[{ heading, items }]`.

`generate.js` imports the moved slicers from `_guides.js` (keeps its exports for the existing tests).

## Generation — focus wiring

Client `generate` payload keeps today's `studyGuide: { key, level | units }` and adds
`focus: classInfo.focus` (the array of ticked `text` strings, sent verbatim — no resolution).

`injectStudyGuide(messages, studyGuide)` extended:
- Unchanged when no `focus`.
- With `focus`, after the extract banner, append:
  `--- TEACHER'S CURRICULUM FOCUS --- Centre this lesson on these specific points; treat the rest
  of the extract as background only:` + the ticked labels as a list.
- Payload shape stays backward-compatible (old clients with no `focus` behave exactly as now).

## Deck — teacher notes

The ticked `focus` strings are written into the LAUNCH **curriculum connection** (already
teacher-only, rides in the LAUNCH speaker notes at export, never the projected slide — see
`index.html` ~line 3314). If the model's returned `launch.connection` doesn't already name them,
they are appended as "Curriculum focus: …" so coverage is explicit in the notes. No
projected-slide change.

## Data flow

```
Year + Subject chosen (listed)
   └─ POST /api/guide {key, level|units}  ──►  parse section → grouped items
        └─ render checkboxes; ticks → classInfo.focus
Make the lesson
   └─ POST /api/generate {messages, studyGuide:{key,level|units}, focus:[labels], stickiness}
        └─ injectStudyGuide: extract + focus block  ──►  model
philosophy: focus is additive; empty focus == today's behaviour
```

## Security & privacy

- Reuses the exact filename allowlist + path-prefix guard; no traversal surface added.
- New endpoint is read-only over public curriculum text; no secrets, no identity, no writes.
- `vercel.json` must ship `api/guides/**` with `guide.js` too (it already does for `generate.js`
  via `includeFiles`).
- No analytics fields change; ticks are never logged.

## Testing

- **Backend unit tests** (`node --test`, new `test/guides.test.js`):
  - `parseItems` on a sample ACARA year section → expected codes/labels/groups.
  - `parseItems` on a sample VCE units block → expected AoS items.
  - `sliceVceUnits` picks the right unit block; `sliceAcLevel` unchanged (existing coverage).
  - `injectStudyGuide` with `focus` appends the focus block; without `focus` is byte-identical to now.
  - `api/guide.js` handler via `_helpers.js` mock req/res: happy path, bad key → `{items:[]}`,
    method/gate rejections.
- **Frontend:** `npm run check:ui` (JSX compiles). Manual pass under `npx vercel dev`:
  Year 11 → Biology → tick 2 AoS → generate → confirm focus appears in LAUNCH notes;
  Year 7 → Science → tick 2 content descriptions → same; Year blank → Subject disabled;
  "Other / not listed" → free-text, no list, still generates.
- Existing `test/*.test.js` and the render must stay green.

## Rollout

- Straight to `main` (auto-deploys Pages + Vercel).
- Bump `APP_VERSION` in `index.html` (~line 676).
- Reversible: the endpoint is additive; the brain Subject field change is localised to one panel.

## Open questions

None — scope locked to the brain experience, year-driven, optional ticking.
