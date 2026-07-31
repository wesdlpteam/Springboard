# Timer spike findings — can PowerPoint carry a ticking MM:SS countdown?

**Date:** 2026-07-31
**Task:** Task 1 of `2026-07-31-deck-quality-fixes.md`
**Verdict: `full`** — presets 1 / 2 / 3 / 5 min at 1-second resolution. Build it.

## What was tested

A throwaway one-slide deck: 301 stacked `MM:SS` text labels (5:00 down to 0:00) plus four preset
buttons, with click-triggered timing XML spliced in by hand, then opened and inspected in real
PowerPoint over COM.

## Numbers

| Measure | Value |
|---|---|
| Clock labels | 301 |
| Shapes on the slide | 308 |
| Slide XML | 554 KB |
| File | 597 KB |
| PowerPoint open time | 1.5 s |
| PowerPoint re-save time | 202 ms |
| Repair prompt | none |

For scale, Nathan's real Year 4 deck is ~4 MB because of its images, so ~0.6 MB of timer is a
noticeable but acceptable addition to one slide.

## The five questions

1. **Opens without a repair prompt?** Yes. PowerPoint also re-saved it in 202 ms, which it will not
   do for a file it had to repair.
2. **Open time?** 1.5 s, against 0.7 s for the same deck before the timing block was parsed.
3. **Countdown registers correctly?** Yes, verified through the COM object model rather than by eye:

   | Preset | Effects | First → last |
   |---|---|---|
   | 1 min | 61 | `SB-CLOCK::60` @0s → `SB-CLOCK::0` @60s |
   | 2 min | 121 | `SB-CLOCK::120` @0s → `SB-CLOCK::0` @120s |
   | 3 min | 181 | `SB-CLOCK::180` @0s → `SB-CLOCK::0` @180s |
   | 5 min | 301 | `SB-CLOCK::300` @0s → `SB-CLOCK::0` @300s |

4. **Keeps time?** Each label's trigger delay is exactly one second after the one before it, all
   measured from the button click. Not yet confirmed against a wall clock over a full run.
5. **Restarting mid-countdown?** Not confirmed. See the second finding below — it needs a change
   before it will work at all.

## Two things that must change in the implementation

### 1. Each preset needs its own `grpId`

The first working run gave every effect `grpId="0"`, matching the app's existing single-animation
helpers. PowerPoint then handed each clock label to whichever sequence claimed it first and silently
truncated the rest:

```
seq 1 (1 min): 61 effects   60 -> 0     correct
seq 2 (2 min): 60 effects  120 -> 61    stops where seq 1 had already claimed the labels
seq 3 (3 min): 60 effects  180 -> 121
seq 4 (5 min): 120 effects 300 -> 181
```

A shape carries one build group per `grpId`. Numbering the presets 0-3 and using that as `grpId` on
both the effect and its `<p:bldP>` entry fixed it completely — all four sequences then ran their full
range. **`tools/audit-deck.mjs` would not have caught this**: the ids were unique, every target
existed, and every animated shape was in `bldLst`. Task 6 needs an assertion on the effect *count*
per sequence, not just on structural validity.

### 2. The stack must hide the previous label, not rely on z-order

The current design shows each label on top of the last, which works only while time runs downwards.
It breaks when a teacher changes preset mid-lesson, which is the whole point of the feature:

- 5 min running, now showing `3:00`. Click 2 min → `2:00` appears. `2:00` is drawn later than `3:00`
  so it covers it. Works.
- 1 min run down to `0:00`. Click 5 min → `5:00` appears, but `0:00` is the topmost label of all and
  keeps covering it. **The clock stays stuck on `0:00`.**

Fix: pair every "show this label" with an explicit "hide the previous label" rather than depending on
draw order, and set `restart="always"` on the interactive sequences so a second preset can interrupt
a running one. That roughly doubles the effect count (~600 for the 5 min preset). Re-measure open
time after making that change — if it pushes much past ~3 s, drop the 5 min preset first, then fall
back to 5-second steps.

## Also worth keeping

The first attempt produced **4 sequences, 0 effects each**: valid XML, opened fine, animations
silently absent. The cause was mis-nesting — the `id+1` `<p:cTn>` was closed early and the inner
`childTnLst` hung off `<p:par>` as a sibling. Copy `sbInteractiveSeq`'s nesting exactly rather than
retyping it. PowerPoint does not complain about a timing tree it cannot use; it just drops it, so
structural checks alone will report success.
