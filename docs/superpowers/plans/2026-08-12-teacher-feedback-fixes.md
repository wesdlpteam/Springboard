# 2026-08-12 — Teacher feedback fixes

Source: anonymous teacher pilot feedback (90-min session). Four code changes, one plan.
All frontend (`index.html`) — no `api/` change, no Vercel deploy expected.

## Root causes found (Fable discovery)

- **Scanned-PDF trap.** `onPdf` (index.html ~5203) shows "name.pdf (28 chars)" as a
  SUCCESS badge no matter how little text pdf.js extracted. `inputReady()` (~5302)
  needs `articleText.trim().length > 20`. Her VCE exam paper is a scan: 28 raw chars,
  ≤20 after trim → app says "Please add a stimulus first…" while the UI shows the PDF
  loaded. Explains her issues 1 AND 2 (Suggest routines disabled with same note).
- **Generic validation copy.** Three sites use one catch-all string: ~5311, ~5421,
  bx-note ~6891. None say WHICH part is missing, and none know the scanned-PDF case.
- **"Make the lesson" dead-button mystery.** ~6939 `disabled={!selectedRoutine}` with
  no explanation when no routine radio is picked (her issue 3, screenshot shows the
  circled dark button above a finished lesson).
- **Output never named up front.** Nothing before generation says the product is an
  editable 4-slide PowerPoint. First mention is the "Download the deck" button.

## Tasks (in order)

### T1 — Scanned/low-text PDF: honest badge + guidance at upload time
In `onPdf`, after `extractPdfText`:
- `t.trim().length === 0` → treat as failure: pdfName cleared, visible error:
  the PDF has no readable text (likely a scan/photo PDF); suggest pasting the text,
  or adding the pages as images under Photo / video.
- `0 < t.trim().length < 200` → KEEP the text but set an amber/warning note near the
  PDF box (reuse `articleNote` pattern or equivalent) saying Springboard could only
  read N characters and it may be a scanned PDF; same two suggestions. Badge shows
  "(only N chars — may be a scan)" instead of the plain success count.
- ≥200 → unchanged behaviour.
Copy register: Cultures of Thinking / plain teacher English, no jargon ("scan" ok).

### T2 — Specific validation messages
Add one helper (e.g. `inputMissing()`) returning the missing pieces:
stimulus / subject / year level, with a special case: `pdfName` set but
`articleText.trim().length <= 20` → message explains the PDF uploaded but too little
text could be read (likely a scan) and what to do — NOT "add a stimulus first".
Use it at ~5311, ~5421 and the ~6891 bx-note so all three name exactly what is
missing (e.g. "Add the year level to continue." / "Your PDF loaded but…").
`inputReady()` logic itself stays as-is.

### T3 — Name the final output early
One visible plain line early in the flow stating the end product, e.g. in the step
THREE panel intro or under the hero: "Springboard turns this into an editable
four-slide PowerPoint you download and adapt." Keep register calm, not salesy.
Also: under the "Make the lesson" button (~6939), when `!selectedRoutine`, show the
existing bx-note pattern: "Pick a routine above first." (fixes the dead button).

### T4 — "First time with this routine?" intro (teacher-requested feature)
New non-persisted state (checkbox) in step THREE near the routine list, e.g.
"My class hasn't used this routine before — introduce it in the deck."
When ticked:
- **THINK slide (deck export + editor preview):** one student-facing intro line above
  the steps, deterministic from existing ROUTINES data (name + gist), e.g.
  "Today we're thinking with 'Peel the Fruit', a Project Zero routine — {gist}."
  Editable in the lesson editor like other fields; empty string omits it.
  Deck builder: fit with fitFontSize; must not collide with timer/steps/reveal at
  current layouts (verify visually).
- **Generation prompt:** add a clause: the class meets this routine for the FIRST
  time — notes.think FACILITATION must open with one sentence introducing the routine
  and the thinking it makes visible; the ENABLING PROMPT must translate the most
  abstract step into concrete question forms (e.g. what puzzles you, what seems
  contradictory, what is not yet explained). Canonical step wording stays LOCKED —
  do not let the model rewrite think.steps (PZ-faithfulness rule).
- Unticked = today's behaviour, byte-identical deck.

## Constraints
- One writer: Codex only. Do NOT touch `test/require-codex-worker.test.js` or
  `tools/require-codex-worker.mjs` (another session's uncommitted work) and do not
  commit them.
- `npm test` + `npm run check:ui` must pass. Run `npm run audit:static` too.
- Bump `APP_VERSION` (index.html ~676) once for the batch.
- WCAG 2.2 AA for any new UI (warning note colour contrast, focusable checkbox with
  label), Wesley palette only, reduced-motion unaffected.
- Class settings must NOT persist across refresh — the new checkbox included.
- Real-browser desktop AND mobile verification with screenshots (visual-required).

## Acceptance criteria
1. Upload a text-light PDF (fixture: any 1-page image-only PDF) → immediate visible
   warning naming the char count and the two alternatives; badge no longer reads as
   success; "Suggest routines" note says the PDF is the problem, not "add a stimulus".
2. With article text present but year level empty → message names the year level only.
3. Step THREE (or equivalent early spot) names the editable PowerPoint before any
   generation; "Make the lesson" with no routine selected shows the helper note.
4. Toggle on → THINK slide preview + exported .pptx carry the intro line; prompt sent
   to /api/generate contains the first-time clause (assert via the headless stubbed
   harness); toggle off → deck unchanged from today.
5. `npm test`, `npm run check:ui`, `npm run audit:static` all green.

## Out of scope (report to Nathan, no code)
- Positioning/comms (benefits framing, SKR PL session, desktop shortcut rollout).
- OCR for scanned PDFs (future idea; today we guide to paste/images instead).
