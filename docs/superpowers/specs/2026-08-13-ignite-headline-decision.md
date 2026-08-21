# 2026-08-13 — IGNITE becomes a headline, not a question

## The decision

The IGNITE slide's big line is now an **engaging headline** (max 12 words, never a
question). The commitment students can be wrong about moved to the **final THINK step**,
immediately before the reveal. Nathan's call, from a real downloaded Year 4 deck.

## Why

The generated question was "Is the person at the easel painting the group on the left?
Point to one clue. Tell the class why it proves your answer." The painting plainly shows
a person at an easel painting the group. Every child could answer it from their seat, so
nobody could turn out to be wrong and the reveal had nothing to overturn.

This was not a one-off. The rule for that field had accumulated four separate "measured
failure" paragraphs between 2026-07-31 and 2026-08-11, and every one of them is the same
disease in a different costume:

- gaze-counting trivia that was checkable but meaningless
- comparisons with no named measure ("who sees more")
- false binaries about where a figure is looking
- a sharing move copied verbatim out of the instructions

Each fix made the rule longer (it reached ~3,400 characters) without curing the cause:
a picture rarely contains a question that is at once non-obvious, decidable from what is
visible, and about something that matters. A headline has to be none of those things. It
only has to be true and make the class want to look, which is what the slide was for.

## What changed

- `ignite.question` (key kept for compatibility) now specifies a headline: max 12 words,
  no question mark, no instruction to choose/vote/point, must be true to what is visible,
  must point at the lesson's focus, and must not be a caption of the obvious.
- The rule is ~1,300 characters instead of ~3,400, which also trims every prompt.
- `reflect.revisit` now sends students back to the commitment made in the final THINK
  step, not to the ignite question, so the deck's logic still closes its own loop.
- Teacher-facing labels changed from "one provocative question" to "one engaging
  headline", and "Revisit the ignite question" to "Revisit what they committed to".
- The jury/review guard caps the field at 12 words instead of 24.

## Second fix in the same deck: reflection stems

Stem 3 read "Next time, I will use visible clues before I decide." — a finished sentence
sitting beside two correct open stems. It answered itself, so the slide told the class
what to conclude. The rule now states that every stem is an open sentence starter ending
mid-sentence, never punctuated with a full stop, and `audit-live-report` fails any stem
that does not trail off.

## Watch for

- IGNITE now carries a headline and the stimulus, with no on-slide instruction. The
  teacher notes still carry the facilitation. If teachers report the slide feels thin,
  the fix is a short teacher-facing line in the notes, not a return to the question.
- The audit's ignite checks are headline checks now (`words > 12`, contains "?",
  contains an instruction verb). The old COMMIT/SHARE checks moved onto the final think
  step, where the commitment now lives.
- The JSON key is still `question` while holding a headline. Left alone deliberately:
  renaming ripples through shapeDeck, both editors, the export, the jury path, the deck
  fixtures and the live report. Worth doing if that field is ever touched again.
