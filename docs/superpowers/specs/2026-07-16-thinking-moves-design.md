# Thinking Moves from the Understanding Map — design

**Date:** 2026-07-16
**Status:** Approved (Nathan, 2026-07-16)
**Touches:** `index.html` only (single-file React app). No backend/API change.

## Goal

Today the teacher hits **Analyse** and the AI suggests routines from the whole
catalogue. Change the flow so the teacher first chooses a **Thinking Move** from
the Understanding Map; Analyse then only ranks routines that belong to that move.

## Decisions (locked with Nathan)

1. **Smart pick (Move + AI).** Pick a Move first, then Analyse reads the stimulus
   and ranks the best-fitting routines *from that move's list*, each with a "why".
2. **Add two routines** the maps use but the app lacks: **Zoom In** and **MicroLab**.
3. **Move is required before Analyse.** Analyse button stays disabled until a move
   is chosen. Changing the move clears the current analysis + pick (same pattern as
   changing year band today).
4. **Year-band filter still applies inside a move.** If a move+band leaves fewer
   than 3 routines, top the list back up from the move's full (band-agnostic) list
   so the teacher never sees an empty/too-short list.
5. **Merge both source maps (superset).** A routine belongs to a move if *either*
   supplied Understanding Map lists it. Sources: map 1 (Project Zero circle) and
   map 2 (thrivinglearners.org / Cultures of Thinking, Harvard — Rachel Mainero).

## The 8 moves and their merged routine lists

Order = Understanding Map circle. Names below are the app's exact `ROUTINES` names
(the map's shorthand mapped to canonical names, e.g. STW→"See, Think, Wonder",
GSCE→"Generate-Sort-Connect-Elaborate", WMYST→"What Makes You Say That?",
CEC→"Connect, Extend, Challenge", CSI→"Color, Symbol, Image",
Sentence Phrase Word→"Word-Phrase-Sentence", 321 Bridge→"3-2-1 Bridge",
4C's→"The 4 Cs", Peeling the Fruit→"Peel the Fruit").

1. **Wondering** — *What are you curious about here?*
   Step Inside · See, Think, Wonder · Zoom In · 3-2-1 Bridge · Think, Puzzle, Explore ·
   Chalk Talk · Compass Points · The Explanation Game
2. **Describe What's There** — *What do you see and notice?*
   Step Inside · See, Think, Wonder · Zoom In · 3-2-1 Bridge ·
   I Used to Think... Now I Think... · Chalk Talk · Peel the Fruit
3. **Build Explanations** — *What's really going on here?*
   See, Think, Wonder · Zoom In · Generate-Sort-Connect-Elaborate · Think, Pair, Share ·
   I Used to Think... Now I Think... · The Explanation Game · Connect, Extend, Challenge ·
   MicroLab · Claim, Support, Question · Peel the Fruit
4. **Reason with Evidence** — *Why do you think so?*
   Step Inside · Circle of Viewpoints · Tug of War · Word-Phrase-Sentence ·
   Generate-Sort-Connect-Elaborate · Peel the Fruit · Claim, Support, Question ·
   MicroLab · What Makes You Say That?
5. **Make Connections** — *How does this fit?*
   Step Inside · Circle of Viewpoints · Chalk Talk · 3-2-1 Bridge · Compass Points ·
   The 4 Cs · Peel the Fruit · Connect, Extend, Challenge
6. **Consider Different Viewpoints** — *What's another angle on this?*
   Step Inside · Circle of Viewpoints · Tug of War · See, Think, Wonder ·
   I Used to Think... Now I Think... · Compass Points · The Explanation Game ·
   Color, Symbol, Image · Peel the Fruit
7. **Capture the Heart & Form Conclusions** — *What's at the centre of this?*
   Step Inside · Circle of Viewpoints · Tug of War · Zoom In · Headlines ·
   Color, Symbol, Image · The 4 Cs · Peel the Fruit · Word-Phrase-Sentence
8. **Uncovering Complexity** — *What lies beneath the surface?*
   Step Inside · Tug of War · See, Think, Wonder · Zoom In · Word-Phrase-Sentence ·
   Claim, Support, Question · Red Light, Yellow Light ·
   I Used to Think... Now I Think... · Generate-Sort-Connect-Elaborate

Every name above already exists in `ROUTINES` except **Zoom In** and **MicroLab**.

## Data changes

### New `MOVES` constant (near `ROUTINES`)
```
const MOVES = [
  { name, question, routines: [ ...exact ROUTINES names... ] }, x8
];
```
Defensive: the UI resolves each name via `ROUTINES.find`; an unresolved name is
silently dropped, never crashes. A code comment notes names must match `ROUTINES`.

### Two new `ROUTINES` entries
- **Zoom In** — group `"Core observation and inquiry"`, bands
  `["younger","middle","senior"]`, url `https://pz.harvard.edu/resources/zoom-in`.
  gist: reveal an image slowly, interpreting and revising as more is uncovered.
- **MicroLab** — group `"Activating, connecting, and reflecting on learning"`,
  bands `["middle","senior"]` (structured timed protocol; tunable), url
  `https://pz.harvard.edu/resources/micro-lab-protocol`.
  gist: structured small-group protocol — each person speaks uninterrupted in
  turn, then the group discusses.

## Logic changes

- **`analyseStimulus({..., move})`** — new `move` arg. Candidate routines =
  `move.routines` resolved against `ROUTINES`, then `.filter(band)`. If fewer than
  3, top up from the move's full (band-agnostic) resolved list. Build the model
  menu, canonicalisation map, and 3-item top-up all from these candidates (was:
  all band routines).
- **State** — add `selectedMove` ("" = none).
- **`pickMove(name)`** — set move; clear `analysis`, `selectedRoutine`,
  `analyseError` so the teacher re-analyses for the new move.
- **`runAnalyse`** — pass the selected move object to `analyseStimulus`.
- **`analyseBandRoutines` useMemo** — when a move is selected, scope to the move's
  routines ∩ band (top-up as above); depend on `selectedMove` too. This re-scopes
  the existing "Browse all routines" list to "routines for this move".

## UI changes

- **New "Choose a Thinking Move" group** above the Analyse step: 8 selectable
  cards from `MOVES`, each showing the move name + its guiding question. Reuse the
  existing `routine-card` / chip styling for visual consistency with the playful
  Wesley UI.
- **Analyse step gate** — button `disabled` also when `!selectedMove`; hint tells
  the teacher to choose a move first.
- After Analyse, the 3 routine cards + the (now move-scoped) browse list behave as
  today. Heading reflects "for this move".
- Generate stays gated on `selectedRoutine` only (unchanged).

## Out of scope (unchanged)

Stimulus input, outcome suggestion, REFLECT routine pinning, PowerPoint export,
band decks, backend `/api/generate`.

## Verification gates

1. `npm run check:ui` (JSX compiles).
2. `npm test` (backend units — should be untouched/green).
3. Manual: pick each move → Analyse → 3 routines all belong to that move; browse
   list scoped to move; Analyse disabled until a move is chosen; changing move
   clears the analysis.
4. Bump `APP_VERSION` v0.6.0 → **v0.7.0** so Nathan can confirm the cache refreshed.
