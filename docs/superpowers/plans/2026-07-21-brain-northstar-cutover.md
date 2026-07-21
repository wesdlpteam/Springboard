# Brain World North-Star Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural Three.js/canvas brain art in the sandbox with the AI-generated north-star images (cover still + living clip, neuron inside view, chamber), overlaying the interactive 8-move UI in plain HTML/CSS/GSAP.

**Architecture:** The brain view becomes image-backed stages: a fixed-aspect "image stage" wrapper shows each north-star asset with `object-fit: cover` math, and the 8 move buttons are absolutely positioned in image-space percentages so they track the artwork at any viewport. Three.js, the silhouette sampler, and the glow painter are deleted; the dive transport becomes a GSAP zoom/crossfade. Scene state machine (`bxScene`: cover → transport → inside → chamber) and the classic view are untouched.

**Tech Stack:** Single-file React-in-Babel `index.html` (no build), GSAP (already loaded), north-star PNG/MP4 assets, chrome-devtools MCP browser for visual verification.

## Global Constraints

- Work ONLY in worktree `c:\...\Springboard\.claude\worktrees\ui-mindmap` (branch `worktree-ui-mindmap`). NEVER merge/push without Nathan's OK.
- `npm test` AND `npm run check:ui` must pass before every commit.
- Classic view (`brainView` false path) must not change.
- WCAG 2.2 AA: text contrast ≥ 4.5:1 on image backdrops (keep scrims), every animation has a reduced-motion alternative, "See as a list" overlay stays fully functional.
- The 8 move colours come from the existing `BX_COLOR` map (official Wesley palette) — do not invent new hex values.
- Cover copy (already decided, do not re-litigate): kicker unchanged; H1 "Thinking, made <em>visible.</em>"; sub "Springboard turns a photograph, a film or an article into a lesson that makes your class's thinking visible."; remove the "ready in about two minutes" clause wherever it appears.
- Bump the visible "build N" stamp in the cover credit line once per user-visible pass (current: build 12 → next 13).
- Assets live at `docs/superpowers/inspiration/2026-07-21-brain-journey/north-star/` (git-ignored). Reference them by that relative path. NOTE for a future merge to main: these files must then be committed or hosted properly — record as a pre-merge blocker in the final task, do not solve now.
- No new CDN dependencies. Three.js CDN tag gets REMOVED, not replaced.

## Reference anchors in `index.html`

The file is ~300 KB; find regions by grep, not line number:
- Cover JSX: `bw-scene bw-cover` (~line 3800)
- Scene root: `className={"bx" + (bxScene !== "cover" ? " bw-on-night" : "")}` (~3782)
- Three engine effect: the single `useEffect` containing `brainApi` (search `brainApi`)
- Painters: `sampleBrainSilhouette`, `paintGlowBrain`, `buildBrainDrawing` (top-level, search each)
- Poster fallback: `bw-poster` canvas
- Move data: `BX_MOVES` / colour map `BX_COLOR` (search `BX_COLOR`)
- Inside labels: `bw-inside` block; chamber: `bw-chamber`
- Three CDN script tag: search `three` in the `<head>` script tags
- CSP/SRI block: search `Content-Security-Policy` if present; else the script tags carry SRI

---

### Task 1: Image-stage foundation + living cover

**Files:**
- Modify: `index.html` (worktree root) — CSS block near `.bw-cover` styles, cover JSX at `bw-scene bw-cover`

**Interfaces:**
- Produces: CSS classes `.bx-stage`, `.bx-stage-media`, `.bx-scrim-left`; const `BX_ASSETS` (top-level, next to `BX_COLOR`):

```js
const BX_ASSETS = {
  base: "docs/superpowers/inspiration/2026-07-21-brain-journey/north-star/",
  cover: "cover.png",        // 2752x1536
  coverClip: "cover-living.mp4",
  inside: "inside.png",      // 2720x1536
  chamber: "chamber.png"
};
const BX_AR = { cover: 2752 / 1536, inside: 2720 / 1536 }; // image aspect ratios
```

- [ ] **Step 1: Add stage CSS.** In the `bx-` CSS block add:

```css
.bx-stage { position: absolute; inset: 0; overflow: hidden; background: #0b0b12; }
.bx-stage-media { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  min-width: 100%; min-height: 100%; width: auto; height: auto; object-fit: cover; }
/* keep left third legible for the headline */
.bx-scrim-left { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(8,8,14,.9) 0%, rgba(8,8,14,.55) 34%, rgba(8,8,14,0) 62%); }
@media (prefers-reduced-motion: reduce) { .bx-stage video { display: none; } }
```

- [ ] **Step 2: Replace the cover's Three canvas layer with the stage.** In the cover JSX (`bw-scene bw-cover`), render BEFORE the text column (video only when motion allowed; the still is always there as base):

```jsx
<div className="bx-stage" aria-hidden="true">
  <img className="bx-stage-media" src={BX_ASSETS.base + BX_ASSETS.cover} alt="" />
  {!prefersReducedMotion && (
    <video className="bx-stage-media" src={BX_ASSETS.base + BX_ASSETS.coverClip}
      autoPlay muted loop playsInline />
  )}
  <div className="bx-scrim-left" />
</div>
```

Use the component's existing reduced-motion detection (search `prefers-reduced-motion` in the JSX scope; if only CSS handles it today, add `const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;` near the top of `App`). Hide the old Three canvas on cover by conditioning its render (do NOT delete the engine yet — that is Task 4): render the Three canvas element only when `bxScene !== "cover"`.

- [ ] **Step 3: Apply locked cover copy.** In the same JSX set H1 to `Thinking, made <em>visible.</em>` and the sub to the trimmed sentence from Global Constraints. Bump the credit-line stamp to `build 13`.

- [ ] **Step 4: Compile gate.** Run `npm run check:ui`. Expected: exit 0.

- [ ] **Step 5: Visual verify.** Open the worktree `index.html` in the MCP browser at 1440x900 and 390x844. Screenshot each. Confirm: video (or still) fills viewport, headline readable over left scrim, Enter button reachable, no double brain (old canvas hidden). Reminder: gsap tweens crawl in the automation browser — force-finish with `gsap.globalTimeline.getChildren(true,true,true).forEach(t=>t.progress(1))`.

- [ ] **Step 6: Commit.**

```bash
git add index.html
git commit -m "feat(brain): living image cover from north-star assets"
```

### Task 2: Transport dive as GSAP zoom/crossfade

**Files:**
- Modify: `index.html` — `enterMind` handler (search `enterMind`), transport JSX (`bxScene === "transport"`)

**Interfaces:**
- Consumes: `.bx-stage` cover markup from Task 1.
- Produces: `diveToInside()` — starts the transport; honours Esc skip and reduced motion; ends with `setBxScene("inside")`.

- [ ] **Step 1: Rewrite the transport.** Replace the Three-driven dive: `enterMind` sets scene `"transport"`, then a GSAP timeline scales the cover stage `1 → 2.4` (transform-origin at the brain: `62% 45%`) while fading to `#0b0b12`, ~2.2s, then flips to `"inside"` which fades in over 0.4s. Store the timeline in a ref so Esc (existing key handler, search `Escape`) can `.progress(1)`. Reduced motion: skip the timeline, set scene `"inside"` directly.

```js
function diveToInside() {
  if (prefersReducedMotion) { setBxScene("inside"); return; }
  setBxScene("transport");
  const tl = gsap.timeline({ onComplete: () => setBxScene("inside") });
  tl.to(".bw-cover .bx-stage", { scale: 2.4, transformOrigin: "62% 45%", duration: 1.7, ease: "power2.in" }, 0)
    .to(".bw-cover", { opacity: 0, duration: 0.6 }, 1.4);
  diveTl.current = tl;
}
```

- [ ] **Step 2: Gate + verify.** `npm run check:ui` → exit 0. In the MCP browser click Enter, force-finish tweens, confirm inside scene shows. Press Esc mid-dive on a second run: lands inside immediately.

- [ ] **Step 3: Commit.** `git commit -am "feat(brain): image-based dive transport"`

### Task 3: Inside view on the neuron artwork

**Files:**
- Modify: `index.html` — `bw-inside` block and its label rendering (search `labelEls`)

**Interfaces:**
- Consumes: `BX_ASSETS`, `.bx-stage` CSS.
- Produces: `IMG_MOVE_POS` — image-space coordinates (fractions of the image, not the viewport) for the 8 move buttons; `bxImagePoint(stageEl, fx, fy)` → `{left, top}` px within the stage after cover-crop math.

```js
// fx, fy are fractions of the source image (0..1). Initial values eyeballed from inside.png;
// Task 3 Step 4 calibrates them. Keys must match BX_MOVES keys exactly.
const IMG_MOVE_POS = {
  capture:  { fx: 0.15, fy: 0.16 }, // crimson neuron, top-left
  complex:  { fx: 0.37, fy: 0.25 }, // purple
  reason:   { fx: 0.62, fy: 0.22 }, // gold
  wonder:   { fx: 0.83, fy: 0.10 }, // blue, top-right
  build:    { fx: 0.77, fy: 0.33 }, // green, right
  view:     { fx: 0.20, fy: 0.60 }, // yellow, lower-left
  connect:  { fx: 0.63, fy: 0.49 }, // orange
  describe: { fx: 0.90, fy: 0.65 }  // violet-grey, lower-right
};
function bxImagePoint(stage, fx, fy, ar) {
  const w = stage.clientWidth, h = stage.clientHeight;
  const scale = Math.max(w / ar, h);          // cover-fit: image height after scaling
  const iw = scale * ar, ih = scale;          // rendered image size
  return { left: (w - iw) / 2 + fx * iw, top: (h - ih) / 2 + fy * ih };
}
```

(Check the real `BX_MOVES` keys by grep and use those; the eight names above are placeholders for whatever the code calls them — every other property stays as written.)

- [ ] **Step 1: Swap the backdrop.** Inside `bw-inside`, render an `.bx-stage` with `inside.png` (no video). Remove the reliance on the Three canvas behind it (canvas still renders until Task 4; set its opacity 0 when scene is inside).

- [ ] **Step 2: Position labels statically.** Replace per-frame projected label positioning with a `useLayoutEffect` (+ window resize listener) that runs `bxImagePoint` for each move and sets `left/top` once. Labels keep their existing classes, text-shadow style, focus order, click handlers, and the dark-pill/below-cluster styling.

- [ ] **Step 3: Gate + rough verify.** `npm run check:ui`; MCP browser: all 8 labels visible, none overlapping, each near a matching-coloured neuron at 1440x900.

- [ ] **Step 4: Calibrate.** Iterate screenshot → nudge `fx/fy` → screenshot at 1440x900, 1280x720, 390x844 until every label sits in a dark pocket beside its colour-matched neuron with zero overlaps. Mobile may rely on the "See as a list" overlay if spacing gets impossible below 480px width — that overlay must open and generate correctly.

- [ ] **Step 5: Commit.** `git commit -am "feat(brain): neuron inside view with image-anchored move labels"`

### Task 4: Chamber backdrop + engine removal

**Files:**
- Modify: `index.html` — `bw-chamber` block, Three `useEffect`, head script tags, top-level painters

**Interfaces:**
- Consumes: everything above.
- Produces: a Three-free brain view; chamber shows `chamber.png` darkened with the chosen move's colour ring rendered in CSS.

- [ ] **Step 1: Chamber backdrop.** In `bw-chamber`, render `.bx-stage` with `chamber.png` plus a dim veil `background: rgba(8,8,14,.55)`, and a CSS halo ring in the chosen move's colour behind the tool panel:

```css
.bw-chamber .bx-ring { position: absolute; width: 340px; height: 340px; border-radius: 50%;
  left: 50%; top: 38%; transform: translate(-50%, -50%);
  box-shadow: 0 0 90px 18px var(--move-colour), inset 0 0 60px 6px var(--move-colour);
  opacity: .28; pointer-events: none; }
```

Set `--move-colour` inline from `BX_COLOR[selectedMove]`. The blue reference image stays the *mood* reference; the ring supplies per-move colour.

- [ ] **Step 2: Delete the engine.** Remove: the Three.js CDN `<script>` tag (and its SRI hash), the entire `brainApi` `useEffect`, `sampleBrainSilhouette`, `paintGlowBrain`, `buildBrainDrawing`, the `bw-poster` canvas and its no-WebGL branch (the image IS the fallback now), and any `glOk` checks. Grep `THREE` afterwards — zero matches allowed outside comments.

- [ ] **Step 3: Full gates.** `npm test` → all pass. `npm run check:ui` → exit 0.

- [ ] **Step 4: End-to-end verify in MCP browser.** Cover → Enter → dive → inside → pick a move → chamber (ring in that move's colour) → All moves → back inside → "See as a list" → Classic view link still works. Repeat with reduced-motion emulation: no video, instant transitions. Screenshot each stage.

- [ ] **Step 5: Commit.** `git commit -am "feat(brain): chamber artwork + remove Three.js engine"`

### Task 5: Record state + pre-merge blockers

**Files:**
- Modify: `docs/superpowers/specs/2026-07-21-brain-art-direction.md` (STATE note at top)

- [ ] **Step 1: Append status.** Add under the title: date, "IMPLEMENTED in sandbox build 13 — assets load from the git-ignored inspiration folder. PRE-MERGE BLOCKERS: (1) commit or host the three PNGs + MP4 properly and repoint `BX_ASSETS.base`; (2) compress assets for web (target <400 KB per image, poster for the clip); (3) mobile calibration sign-off."

- [ ] **Step 2: Commit.** `git commit -am "docs: north-star cutover state + pre-merge blockers"`

---

## Self-review notes

- Spec coverage: cover still+clip (T1), motion rules incl. reduced-motion (T1/T2), neurons inside with labels in dark pockets (T3), chamber halo + calm (T4), locked copy (T1), palette via existing `BX_COLOR` (constraint), a11y list path (T3/T4). Rejected orb look: not reintroduced anywhere.
- The only invented names (`BX_ASSETS`, `BX_AR`, `IMG_MOVE_POS`, `bxImagePoint`, `.bx-stage*`, `.bx-ring`, `diveToInside`) are defined in their producing tasks and used consistently.
- Placeholder scan: `IMG_MOVE_POS` initial values are explicitly labelled "calibrated in Task 3 Step 4", with the calibration procedure given — not a TBD.
