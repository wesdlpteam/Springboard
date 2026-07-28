# Article summary on THINK + click-to-enlarge photos — design

Date: 2026-07-28
Status: approved by Nathan, ready to implement

## Problem

Two gaps, both about what students actually see on the projected deck.

1. **Articles arrive on the slides as nothing.** In article mode `drawStimulus` draws only
   `articleImageUrl`. A teacher who uploads a PDF with no lead image and no link gets an IGNITE
   slide with a title and a question, and a THINK slide with the routine spread full width. There
   is no student-facing account of the article anywhere in the deck. The Tech Spotlight Generator
   solves this with an "EXACTLY 5 sentences" student-facing `summary` field printed beside the
   routine, with the source link + QR under it. Springboard has no equivalent.

2. **Photos can't be examined closely.** A stimulus photo occupies a 5.6" x 5.3" panel on IGNITE.
   Students at the back of a room can't study detail in it, and PowerPoint offers no built-in
   zoom during a slideshow.

Secondary gap found while scoping: the watercolour brain chamber's article step is a bare
`<textarea>` (index.html ~4210). It has no link input and no "Fetch text" button, both of which the
Classic view has (~4769). So the default flow can never attach a source URL, which means it can
never produce a QR code even though the deck builder supports one.

## Decisions

- The summary renders on **THINK**, beside the thinking routine, mirroring Spotlight's provocation
  slide. IGNITE keeps its current behaviour unchanged.
- The summary is stored as `deck.think.summary`. Putting it inside the `think` slice means the
  existing per-slide "Regenerate" button and `mergeScopedFields` pick it up with no plumbing change.
- Click-to-enlarge uses **hidden slides plus slide-jump hyperlinks**, not animation. PptxGenJS 3.12
  has no animation support at all; both required primitives were verified against the pinned build
  (see Verification).

## Feature 1 — article summary

### Model contract

`generateSpringboard` adds `summary` to the `think` object in the STRICT JSON schema line, plus a
limits entry:

- Article mode (`sourceText` present, `mode !== "media"`): EXACTLY 5 sentences, student-facing,
  pitched to the class band and subject, concrete about what actually happened, ends on a note that
  invites discussion. Hard rule: never invent quotes, names, numbers or events that are not in the
  supplied text.
- Media mode: empty string. Photo and video lessons are unchanged.

`shapeDeck` gains `summary: str(th.summary)` inside `think`. Decks generated before this change
simply carry `""`, so every downstream read must tolerate an absent/empty value.

### Slide render (THINK)

Today the right-hand panel on THINK is gated on `hasImageStim` (media mode only). Add a parallel
`hasArticleStim` for article mode when any of `think.summary`, `articleImageUrl` or `link` exist.
When set, the routine column narrows to exactly the same geometry the image case already uses, and
the panel draws top-to-bottom:

1. lead image, if `articleImageUrl` resolved, capped at ~45% of panel height, aspect preserved
2. the 5-sentence summary, `fit: "shrink"` so a long summary can never overflow into the row below
3. a "Read the full article:" row — QR code + underlined clickable URL — when `link` is set

Both `hasImageStim` and `hasArticleStim` can never be true at once (they are mutually exclusive
modes), so the narrow-column geometry is shared.

### App UI

- An editable textarea under the THINK slide in the deck preview, labelled "What students read",
  visible only in article mode. Same `.editable` styling and `patchSlide("think", {...})` wiring as
  the other fields.
- The brain chamber's article step gains the Classic view's article-link input and "Fetch text"
  button, both calling the existing `fetchArticleFromLink`.

## Feature 2 — click to enlarge

### Mechanism

For each photo drawn on a slide, append one **hidden** zoom slide at the end of the deck:

- `slide.hidden = true` emits `show="0"` on `<p:sld>`, so PowerPoint skips it on normal advance but
  still honours a hyperlink jump to it. The deck still walks as 4 slides (5 with an advisory).
- The source photo gets `hyperlink: { slide: <zoomNum>, tooltip: "Click to enlarge" }`, which emits
  `action="ppaction://hlinksldjump"` plus a slide relationship.
- The zoom slide is black, with the photo scaled by the existing `contain` helper to the largest
  size that preserves its shape. A full-bleed transparent shape underneath and the photo itself both
  carry `hyperlink: { slide: <igniteNum> }`, so a click anywhere returns to IGNITE. A small
  "Click anywhere to go back" caption sits in a corner.

### Scope

- Images only. Videos and YouTube posters are untouched: clicking those plays them, which is the
  behaviour teachers want, and the YouTube poster already carries an `altText` marker consumed by
  the post-build rewrite.
- IGNITE draws at most 4 photos (a 2x2 grid when several are attached), so at most 4 zoom slides.
  THINK re-draws the same photos and links to the same zoom slides — no duplicates.
- Article lead images get the same treatment.

### Slide numbering

Zoom slides land after the four content slides. The IGNITE slide number is known when it is
created; THINK, LAUNCH and REFLECT always follow it, so the first zoom slide number is
`igniteNum + 3 + 1`. This is robust to the optional advisory slide, which precedes IGNITE.

## Verification

Both PowerPoint primitives were confirmed against the pinned pptxgenjs 3.12.0 by building a probe
deck and reading the generated XML:

- `hyperlink: { slide: N, tooltip }` on `addImage` produced
  `<a:hlinkClick r:id="rId2" tooltip="Click to enlarge" action="ppaction://hlinksldjump"/>` with a
  matching `.../relationships/slide` entry in the slide rels.
- `slide.hidden = true` produced `<p:sld ... show="0">`.

Spotlight already ships `hyperlink: { slide: N }` for its carousel arrows, so the technique is
proven in a deck teachers already use.

Before this is called done, a real deck is generated from a real article through the live
`/api/generate`, rendered to PNG via PowerPoint COM (see the `springboard-pptx-render-verify`
note), and checked for: the summary panel on THINK, the QR and link, and a working enlarge jump.

## Out of scope

- No in-app lightbox. Nathan explicitly wants the enlarge in the exported PowerPoint.
- No Google Slides guarantee. Slide-jump links and hidden slides are PowerPoint features; a Google
  Slides import may or may not preserve them.
- No change to IGNITE's layout, and no fifth content slide.

## Risks

- The deck file grows: each enlarged photo is stored twice. Acceptable for the 4-photo cap.
- A 5-sentence summary plus a lead image in a ~5" wide panel is tight. `fit: "shrink"` is the
  guard, and the lead image is capped so text always has room.
- Backwards compatibility: any deck in a teacher's browser state from before this change has no
  `think.summary`. Every read is guarded.
