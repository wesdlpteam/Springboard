# Today's Learning slide (IB PYP) — design

**Date:** 2026-08-07
**Status:** implemented

## The ask

Nathan: for PYP lessons, add a slide before the opening question carrying a learning intention
written as a question (with the IB key concept in brackets), success criteria for the lesson, and
the learner profile attributes the lesson connects to. Modelled on a real Wesley slide: three
columns headed *Learning about…*, *Learning to do…*, *Learning to be…*.

## What switches it on

**The year level, Prep–Year 6. Never the curriculum dropdown.**

This is the decision the whole feature turns on. Wesley is an IB school that teaches from the
Australian Curriculum, so its primary teachers select "Australian Curriculum" to get the ACARA
grounding in the LAUNCH connection. Keying the slide to the "IB PYP" dropdown option would have
meant Nathan's own teachers never saw it. The app already names the two primary bands *PYP Early
Years (Prep – 2)* and *PYP Junior Years (3 – 6)*, so the band is both the correct signal and the
one already in the code (`isPypBand`).

## Shape

A new `learning` field on the generated deck:

```
learning {
  about[1-3] { question, concept }   // intention as a question + one PYP key concept
  do[2-4]                            // "I can …" success criteria
  be[2-4]                            // IB learner profile attributes
}
```

Counts are ranges, not fixed. A single-focus lesson has one learning intention and padding it to
three with rewordings is worse than returning one; the prompt says so explicitly.

## The two closed lists

- **Key concepts (7):** form, function, causation, change, connection, perspective, responsibility
- **Learner profile (10):** Inquirer, Knowledgeable, Thinker, Communicator, Principled,
  Open-minded, Caring, Risk-taker, Balanced, Reflective

Enforced in three places, because a closed list in a prompt is a request, not a guarantee — the
same reason the routine-name canonicaliser exists:

1. the prompt names both lists in full,
2. `shapeLearning` canonicalises on letters only (`Risk taker` → `Risk-taker`) and **drops**
   anything off-list,
3. the editor offers dropdowns, not free text, so editing cannot be the way invented IB language
   reaches a slide.

A shorter column is a smaller problem than wrong IB vocabulary on a Wesley slide.

## The slide

Three columns on the standard white slide chrome, drawn **before IGNITE**. Column headers are
rounded chips in Wesley `subtle` with purple text; hairline gold rules sit in the gaps between
columns. Column 1 puts each question in its own outlined box with the key concept in italics
beneath it; column 2 bullets the success criteria; column 3 spaces the learner profile attributes
down the column. `fitFontSize` handles long questions.

It **counts** in the footer — students see it, so a normal PYP lesson now reads `1 / 4` through
`4 / 4` rather than `1 / 3`. The teacher preface remains uncounted.

Drawing it before IGNITE is also what keeps the click-to-enlarge links correct for free:
`zoomBase` is computed from `pptx.slides.length` at IGNITE time, so it picks the new slide up with
no arithmetic change.

## Editing

A `PYP · Today's learning` block in the lesson editor, above IGNITE: textareas for the questions
and success criteria, dropdowns for concepts and attributes, add/remove per row within the
1–3 / 2–4 / 2–4 caps.

## Verification

`tools/audit-deck.mjs` gained a `pyp-learning` config: a real Year 4 export, driven through the
real UI, asserting the slide exists, sits before IGNITE, heads all three columns, prints the key
concepts in brackets, prints three `I can` criteria and the three attributes, is numbered in the
footer, and carries teacher notes. Its fixture deliberately plants an invented key concept
("sustainability") and an invented attribute ("Wizard"); both must be absent from every slide.

Two harness faults were found and fixed while building it, and both are worth keeping:

- the year picker is filtered by teaching band, so setting "Year 4" silently did nothing and the
  config exported a Middle school deck. The harness now sets the owning band first and **throws**
  rather than continuing with the wrong band.
- `TODAY'S LEARNING` did not match in the slide XML because pptxgenjs escapes the apostrophe.

## Known consequence

`index.html` has passed 500 KB, so Babel-standalone now prints an informational note about its own
output formatting to `console.error` on every page load. It is not a fault, but it was failing six
UI-audit checks; `audit-ui.mjs` now ignores that one note and nothing else.
