# Deck quality fixes — advisory, intention, THINK timer, reveal button, REFLECT coherence

**Date:** 2026-07-31
**Status:** design, awaiting approval
**Source:** Nathan's review of `Springboard – One Flag, Two Very Different Stories – HASS (F–6) Y4.pptx`
(Downloads, exported 2026-07-31 10:25). Every finding below was reproduced by reading that file's
slide XML, not inferred.

## Why

A real Year 4 deck went out with eight defects across four slides. Two are code bugs, one is a
product decision, and five are the generation prompt failing to enforce rules it already states.
The deck is the product — a lesson a teacher cannot run as printed is a failure regardless of how
fast it was built.

## Decisions taken (Nathan, 2026-07-31)

1. **Content advisory: removed completely.** The slide, the teacher-notes line, the model field and
   the editor toggle all go. The app stops flagging sensitive themes.
2. **THINK timer: editable in the app AND changeable on the slide.** A digital MM:SS countdown at
   bottom-right, with preset duration buttons the teacher can hit live in class.

## Findings, and the fix for each

### 1. Content advisory slide (remove)

Observed: slide 2 of 11 was `CONTENT ADVISORY / The lesson addresses invasion, colonisation and harm
to First Nations people…`, and it consumed a numbered student slide slot (`1 / 4`).

Built at [`index.html:4653`], gated by `showAdvisory` ([`index.html:4385`]). Removal touches:

- `shapeDeck` — drop `advisory` from the shaped deck and the `ad` local ([`index.html:2525`, `:2553`]).
- Generation prompt — drop the `Set advisory.flag true only for sensitive themes…` instruction
  ([`index.html:2647`]) and `advisory{flag, reason}` from the returned-keys list ([`index.html:2648`]).
- Deck builder — drop `showAdvisory`, the advisory slide block, and the `+ (showAdvisory ? 1 : 0)`
  term in the student slide count ([`index.html:4411`]).
- Editor UI — both advisory blocks ([`index.html:5569`], [`index.html:6296`]), the `includeAdvisory`
  state ([`index.html:3625`], [`index.html:4249`]) and the `.advisory-*` CSS.
- Audit — `tools/audit-deck.mjs` has a dedicated `media-advisory` scenario and an assertion
  ([`tools/audit-deck.mjs:44`, `:232`]). The scenario is deleted, not weakened, and the assertion is
  replaced by one proving no deck can ever emit `CONTENT ADVISORY`.

**Consequence to accept:** the student slide count drops from four to three on a flagged lesson
(IGNITE, THINK, REFLECT). That is correct — the advisory was never a lesson slide.

### 2. Learning intention printed the curriculum descriptor (prompt)

Observed on slide 3: *"We are learning the effects of contact with other people on First Nations
Australians and their Countries/Places following the arrival of the First Fleet and how this was
viewed by First Nations Australians as an invasion."* That is the ACARA content description with
"We are learning" bolted on. 40 words against a stated limit of 18, and ungrammatical.

The rule already exists ([`index.html:2682`]) and was ignored. Strengthen it to:

- Hard cap 18 words, student-facing, must read grammatically after "We are learning to".
- **Never restate, quote or lightly reword a curriculum content description, achievement standard or
  outcome statement** — the curriculum extract says what the lesson covers, the intention says what
  students will be able to do, in their words.
- Include the observed failure verbatim as a named anti-example. Measured failures embedded in the
  prompt are how this codebase's other rules were hardened; follow that pattern.

The teacher-supplied branch ([`index.html:2681`]) keeps returning the teacher's wording untouched —
that is correct behaviour and stays.

**Optional, flagged for Nathan to drop:** a soft hint in the editor when the intention runs over ~20
words or contains a curriculum code, since the app cannot reword a teacher's own text but can
mention it.

### 3. Ignite question does not say to discuss it (prompt)

Observed: *"Does this raised British flag mark a beginning or a takeover? Choose one visible clue."*
The student picks a clue and then nothing — the class discussion that makes the move work is implied,
never instructed.

Add a rule to `ignite.question`: it must name what students do with their answer, including the
sharing move where there is one ("choose one visible clue and be ready to defend it to the class").
Prompt-only change; no contract change.

### 4. Step 1 timing contradicts the timing line (prompt)

Observed on slide 4: `How to run it: Individual, two timed rounds: Round 1—2 minutes; Round 2—2
minutes` printed directly above `1. Look quietly at the flag-raising painting for 30 seconds`.

Nothing currently forces `think.steps` to agree with `think.structure`. Add: any duration named in a
step must match the durations in `think.structure`; if the structure names rounds, the steps use
those rounds' times.

### 5. "bet:" as the commitment verb (prompt)

Observed: *"Using your 20 observations, bet: was this painted during the event or long afterwards?"*

The commit-before-reveal move is right; the register is wrong for a classroom. Ban gambling
vocabulary ("bet", "wager", "odds") and require plain classroom verbs — decide, choose, predict,
commit to, make a call.

### 6. Reveal button label says nothing (deck + contract)

Observed: `Click to reveal  ▸`. The teacher cannot tell what is behind it without opening the notes.

Add `think.reveal.label` to the generated contract: ≤4 words naming what is revealed, e.g.
*"the painting's origin"*. The button then reads **"Click to reveal: the painting's origin"**.
Falls back to today's generic wording when the field is empty, so old saved decks still render.

Touches `shapeDeck` ([`index.html:2538`]), the prompt's reveal rule ([`index.html:2693`]) and the
button text ([`index.html:4836`]).

### 7. Reveal button is only clickable at its edges (bug)

Reproduced in the XML. The pill and its label are **two separate objects**:

```
s.addShape(roundRect, { …, objectName: SB_REVEAL_TRIGGER });   // index.html:4835 — carries the click
s.addText("Click to reveal  ▸", { … });                        // index.html:4836 — sits on top, inert
```

The click action lives on the shape only. The text box is layered above it and swallows every click
that lands on the glyphs, which is exactly the reported symptom: only the two edges respond.

Fix: draw it as **one** object — `addText` with a `shape: roundRect` + `fill`, carrying
`objectName: SB_REVEAL_TRIGGER`. The whole pill becomes a single click target.

`injectThinkAnimations` finds the trigger by `<p:cNvPr … name="SB-REVEAL-TRIGGER">`
([`index.html:3386`]), which a text-in-shape object still emits, so the animation splice is unaffected.
This must be verified in the exported XML, not assumed.

### 8. REFLECT prompts contradict the lesson (prompt)

Observed on slide 5:

```
Revisit your thinking
Reconsider: beginning or takeover? Use what the painting leaves out.
1  Headline: For First Nations families and Country, the First Fleet's arrival meant…
2  The lesson moment that changed my headline was…
3  Next time an image tells one side, I will…
```

Prompt 2 asks what changed a headline students were never asked to write. The Headlines routine only
works if they commit to one early, and this lesson never did. Separately, `reflect.revisit` has
compressed into a colon-note ("Reconsider: beginning or takeover?") rather than something a teacher
can read aloud.

Two prompt rules:

- **Self-containment:** every `reflect.prompts` stem must be answerable from what THIS deck actually
  asked students to do. If a stem refers to something students made earlier (a headline, a first
  guess, a ranking), that thing must genuinely have been produced in `ignite` or `think`. Otherwise
  choose a reflection routine that does not depend on one.
- **`reflect.revisit`** becomes a complete question a teacher reads aloud, ≤20 words, no
  colon-compressed shorthand.

### 9. THINK timer — fixed, wrong place, wrong form

Today: a gold bar top-right of the routine column that drains over `thinkMinutes(structure)`
([`index.html:4773`–`4787`]), with the duration baked at export.

New design:

- **Position:** bottom-right of the slide, clear of the routine steps and the reveal pill.
- **Form:** a digital `MM:SS` readout that counts down when started.
- **Editor field:** a minutes input in the THINK section, defaulting to `thinkMinutes(structure)`,
  stored as `think.minutes` on the deck so it survives edits and export.
- **On the slide:** small preset buttons (1 / 2 / 3 / 5 min) beside the clock. Clicking one runs
  that countdown, so timing can change mid-lesson without leaving the slideshow.

**Mechanism.** PowerPoint has no countdown primitive and `.pptx` cannot carry macros. The countdown
is a stack of `MM:SS` text boxes at one position, revealed one per second by a click-triggered
timeline — the same XML splice technique `injectThinkAnimations` already uses for the drain bar and
the reveal ([`index.html:3378`]). One shared stack of second-labels serves every preset, so a 5-minute
maximum needs ~301 boxes rather than one stack per preset.

**This is the risky part and it gets a spike before anything else is built.** Build the timer alone,
export it, open it in real PowerPoint, and measure: file size added, whether the deck stays
responsive, and whether the countdown actually keeps time. Documented fallbacks, in order, if it does
not hold up:

1. Drop to presets 1 / 2 / 3 min (max ~181 boxes).
2. Count in 5-second steps (~61 boxes for 5 minutes).
3. Keep the draining bar mechanic but move it bottom-right and add the preset buttons.

If all three fail, report that plainly rather than shipping a timer that makes decks sluggish.

## Contract changes

| Field | Change |
|---|---|
| `advisory{flag, reason}` | removed |
| `think.reveal.label` | added, ≤4 words |
| `think.minutes` | added, set by the editor, not the model |

`shapeDeck` stays tolerant of decks missing the new fields so previously saved lessons still load.

## Testing

- `npm test` and `npm run check:ui` must pass — the standing gate before any commit.
- `npm run audit` (1003 assertions) must pass, with `tools/audit-deck.mjs` updated: the
  `media-advisory` scenario deleted and replaced by an assertion that no exported deck contains
  `CONTENT ADVISORY`.
- New deck assertions: the reveal pill is a single object carrying the click action; the reveal
  button text includes the label when one is supplied; the timer renders bottom-right.
- Prompt rules cannot be unit tested. They are verified by generating real decks from the same
  stimulus and reading the output — specifically that the intention is ≤18 plain words, step timings
  match the structure line, no gambling verbs appear, and no reflect prompt references an artefact
  the lesson never asked for.
- Backend prompt changes live in `api/generate.js` only if the stickiness block changes; the rules
  above sit in `index.html`'s prompt builder, so **no Vercel deploy is required** unless that changes
  during implementation. If it does, deploy and verify per `CLAUDE.md`.

## Success criteria

Regenerating the same Year 4 First Fleet lesson produces a deck where:

1. No content advisory slide exists.
2. The intention is ≤18 words, plain student language, grammatical, and is not the curriculum
   descriptor.
3. The ignite question names both the choice and the class discussion.
4. No step's stated timing contradicts the "how to run it" line.
5. No gambling vocabulary appears anywhere.
6. The reveal button names what it reveals and responds to a click anywhere on the pill.
7. Every reflect prompt is answerable from what the lesson actually asked students to do.
8. The timer sits bottom-right, shows MM:SS, and its duration can be changed both in the editor and
   during the slideshow.

## Out of scope

- **Generation speed** (streaming, image downscaling, prompt cache ordering). Designed and approved
  separately on 2026-07-31; parked until this ships, because both touch the generation prompt and
  landing them together would make either impossible to verify.
- **The text-heavy lesson editor** Nathan raised with a screenshot on 2026-07-31. A real problem,
  a separate job.
- The LAUNCH slide's absence from the projected deck. Deliberate, per the 2026-07-30 change at
  [`index.html:4853`].
