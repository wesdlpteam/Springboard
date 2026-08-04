# Step two clarity: one intention, one tamed curriculum list

**Date:** 2026-08-04
**Status:** approved by Nathan, ready to build
**Scope:** the brain view's Step two panel in `index.html`. No `api/` change, so no Vercel deploy.

## Problem

Under Year and Subject, Step two stacks three controls that all read as "what is this
lesson about?":

1. **Curriculum focus (optional)** — a `<details open>` tick list straight from the
   curriculum guide. Year 7 English is 24 items under 12 headings, each written as
   `AC9E7LA02 — recognise language used to evaluate texts including visual and
   multimodal texts…`.
2. **Learning focus (optional)** — a one-line input, placeholder "e.g. how structure
   shapes meaning". Backed by `classInfo.outcome`.
3. **Learning intention** — the `We are learning to…` textarea plus "Let AI decide".

Three failures follow:

- **Name collision.** Two fields called "focus" doing different jobs.
- **The list swamps the panel.** Open by default and long, so the learning intention
  (the field that actually drives every slide) is pushed below the fold.
- **Ticking looks inert.** Nothing on screen says what a tick changes, so the tick list
  reads as curriculum paperwork rather than a control.

Year and Subject are not part of the problem and do not change.

## Decisions taken

- Teachers may steer the lesson **either** by writing an intention **or** by ticking
  curriculum, or both. Neither route is demoted to a power-user extra.
- The one-line "Learning focus" input is **removed from the brain view**. The intention
  box says the same thing in better words, and `intention` already forces every deck
  field to serve it (`generateSpringboard`, index.html:2837-2838), which is strictly
  stronger than what `outcome` did.
- The curriculum list is **collapsed by default**. This is the single biggest fix for
  "hard to follow"; the cost is one click to reach the curriculum.

## Design

### Layout

```
Step two
YOUR CLASS
So the language and curriculum fit.

  Year [ Year 7  v ]    Subject [ English  v ]

  Learning intention
  ┌───────────────────────────────────────────┐
  │ We are learning to…                       │
  └───────────────────────────────────────────┘
  [ Let AI decide ]  Leave blank and Springboard
                     writes one as it builds.

  ▸ Curriculum focus · none ticked (whole subject)

  ── opened, with 2 ticked ──
  ▾ Curriculum focus · 2 ticked            Clear all
    Tick what this lesson targets. Leave blank to
    cover the whole subject.
    [ filter: structure____________________ ]

    TEXT STRUCTURE AND ORGANISATION
    ☑ identify and describe how texts are
      structured differently…        [AC9E7LA03]
    ☐ understand that the cohesion of texts
      relies on devices that signal… [AC9E7LA04]
```

1. **Year / Subject** unchanged (`bx-two` grid, same handlers).
2. **Remove** the `bx-outcome` field from the brain view entirely.
3. **Move the Learning intention block up**, directly beneath Year/Subject. Same
   textarea, same "Let AI decide" / "Try another" / "Clear" buttons, same helper line.
4. **Curriculum focus block moves below it** and gains:
   - `<details>` **closed by default** (drop the `open` attribute).
   - A stateful summary: `Curriculum focus · none ticked (whole subject)` /
     `Curriculum focus · 3 ticked`. On load failure the summary itself carries the
     message so the problem is not hidden inside a collapsed box.
   - A **Clear all** control, rendered only when at least one item is ticked. It must sit
     outside `<summary>` (a button inside a summary swallows the toggle), so it goes on
     the first row of the open panel.
   - A **filter input**, client-side only. Case-insensitive substring match against the
     item text (which already carries the code), applied per item; headings whose items
     all fail the filter are not rendered. A ticked item always survives the filter, so
     filtering can never silently hide a choice the teacher already made.
   - **Row reflow:** plain description first, code demoted to a small muted tag at the
     end of the row. Requires splitting `it.text` on the existing `CODE — description`
     shape; when there is no code (VCE items), render the text as-is.

### The visible link between the two

When `classInfo.focus.length > 0`:

- the intention button reads **"Write one from my ticks"** instead of "Let AI decide"
  (still "Try another" once an AI intention is in the box);
- the helper line under it reads "Springboard will use the N curriculum items you
  ticked."

This is honest, not cosmetic: `suggestIntention` already folds `classInfo.focus` into
`studyGuide.focus` (index.html:3213-3214), as does `generateSpringboard`
(index.html:2900-2901). The label is describing behaviour that already exists but was
invisible.

### Behind the scenes

- No `api/` change. No new network calls. The filter is pure client state.
- `classInfo.outcome` stays in the model and in Classic view (index.html:6622-6678),
  which keeps its own "Paste from planner / AI suggestions" control. It simply stops
  being editable from the brain view. A value set in Classic and then carried into the
  brain view mid-session remains in effect and unseen; accepted, because `sb_class` does
  not persist across refreshes and an intention (when present) outranks it anyway.
- `theme = classInfo.outcome || classInfo.subject` (index.html:4178) falls back to
  subject, which is the correct behaviour for a brain-view lesson.

## Edge cases

| Case | Behaviour |
|---|---|
| IB MYP / IB DP, or "Other / not listed" subject | No guide loads, so the curriculum block does not render at all. Unchanged. Intention block still shows. |
| Year or Subject changed | Ticks already clear (`focus: []`); summary resets to "none ticked" and the filter clears. |
| Guide still loading | Summary reads "Curriculum focus · loading…", block renders closed. |
| Guide failed to load | Summary carries the existing error copy. Teacher can still build. |
| Filter matches nothing | One plain line inside the panel: "Nothing matches that word." |
| Ticked item filtered out | Cannot happen; ticked items bypass the filter. |

## Accessibility

- The filter input gets a real `<label>`/`id` pair (a bare label is not announced).
- The tick count lives in the `<summary>` text, so it is read out on every toggle.
- Existing focus outlines and contrast tokens are reused; no new colours.

## Verification

- `npm test` and `npm run check:ui` must both pass (the only frontend safety net).
- `npm run audit:static` and `npm run audit:ui` for contrast and accessibility.
- Headless screenshots of the panel at **1163x560** (Nathan's real viewport), 1908x924,
  and 1024x768, with a real subject picked so the curriculum block is present.
- Bump `APP_VERSION` (index.html:1406).

## Out of scope

- Classic view's outcome control.
- AI-suggested curriculum shortlists (option "Suggested first"); revisit only if the
  filter proves not to be enough.
