# Springboard "Brain World" — click-to-enter 3D experience (sandbox)

**Date:** 2026-07-21
**Status:** Approved direction (Nathan, this session): true 3D · deep night inner world ·
floating constellations · calm chamber workspace.
**Scope:** sandbox worktree only (`.claude/worktrees/ui-mindmap/index.html`, brain view).
Classic view, backend, and live site untouched.

## 1. Summary

Replace the scroll-film brain experience with a click-to-enter journey:

1. **Cover** — porcelain page, slowly rotating 3D particle brain, "Every lesson begins in
   the *mind.*", one **Enter** button. No scroll storytelling.
2. **Transport** — on Enter, camera dives into the brain; particles rush past; world
   crossfades porcelain → deep night mid-flight; synapse colour starts firing. ~3.5 s,
   skippable (click / Esc / reduced motion).
3. **Inside** — dark neural world. Eight thinking moves float as glowing constellations
   (own move colour, serif name + question label). Gentle drift. Quiet "See as a list"
   fallback button.
4. **Chamber** — clicking a move glides camera to its cluster; world dims/softens; the
   existing three-panel working tool appears restyled dark, bathed in the move colour.
   Same engine end-to-end: `pickMove` → `runAnalyse` → `generate` → slide cards → download.
5. **Back out** — "← All moves" returns to constellation space. "Classic view" stays.

## 2. Technology

- **Three.js** for real 3D (points, line segments, perspective camera, fog). Loaded like
  our other CDN libraries: pinned version, SRI hash, CSP `script-src` entry. Three
  0.150.1 is the last UMD release; it loads as a classic pinned+SRI script exposing
  `window.THREE`, matching the house CDN pattern exactly. Brain-view code guards on
  `window.THREE` being present.
- **GSAP** (already on the page) drives camera tweens (enter flight, glide-to-chamber)
  with expo ease-out. **No ScrollTrigger, no Lenis** in the brain view — both removed
  from the brain-view effect (classic view untouched).
- **One persistent WebGL canvas**, `position: fixed`, full viewport, z-index under all
  DOM. All text/UI stays real DOM above it (accessibility, focus, selection).

## 3. Scene architecture

Single React state: `bxScene: "cover" | "transport" | "inside" | "chamber"`.
`selectedMove` (existing) drives which chamber. One `useEffect` owns the Three lifecycle
(create on brain-view mount, dispose on unmount); scene changes never rebuild the world,
they only move the camera and retarget animation.

**World contents (built once):**

- **Brain shell** — reuse the existing `BRAIN_D` Lucide-path rasterise/sample technique
  to get 2D silhouette points, then give each point depth: mirrored ±z with elliptical
  falloff (thicker at centre, thin at rim) so the cloud reads as a volumetric brain from
  any angle. Desktop ~6,000 points + ~2,500 short line segments (nearest-neighbour
  synapses); mobile ~2,200 points. Ink-dark points on the cover; same geometry re-tinted
  as faint deep-night mist once inside.
- **Colour neurons** — ~10% of points carry move colours (existing `BX_COLOR`), dim on
  the cover, glowing inside.
- **Eight constellations** — one cluster per move: 60–90 points in the move colour +
  internal synapse lines, arranged on a wide ring around the camera's inside position
  (varied height/depth so it feels spatial, not a menu carousel). Cluster centres are
  fixed world coordinates; each drifts subtly (sine offsets).
- **Background** — deep-ink clear colour (`#101017`-family), exponential fog, ~800
  far-field speck points for parallax depth.

**DOM overlays per scene (React-rendered, canvas never carries text):**

- Cover: kicker, headline, one-line lede, **Enter the mind** button (real `<button>`,
  autofocus), "Classic view" nav. Porcelain background is a DOM layer that crossfades
  out during transport (so WebGL clear colour can stay dark throughout).
- Inside: 8 move labels — real `<button>`s absolutely positioned by projecting each
  cluster's world coordinate to screen space every frame (`vector.project(camera)`);
  hidden when behind camera or off-screen. Serif name + small question line + colour
  key dot. Plus "See as a list" (opens the same buttons as a plain vertical list
  overlay — also the keyboard/screen-reader path) and "Classic view".
- Chamber: dark-restyled `.bx-tool` (existing markup + a `bx-night` class): panel text
  ≥4.5:1 on panel surfaces, inputs dark with light text, move colour used for the h2,
  accents and the primary button. Slide-preview overlay reused as-is (already dark
  scrim). "← All moves" returns to `inside`.

## 4. Motion & transitions

- Cover: brain rotates slowly (~12 s/turn), points shimmer subtly. No scroll hijack;
  page does not scroll in cover/inside/chamber scenes (footer content lives behind an
  "About" link instead).
- Transport (~3.5 s): camera z tween into brain centre (expo in-out) → through the dense
  core (particles streak: brief additive blending + point-size ramp) → porcelain DOM
  layer fades, night world + constellations fade in → camera settles at inside position.
  Any click/keypress during flight jumps to the end state instantly.
- Inside: camera idles with tiny orbital sway; clusters pulse gently on hover
  (hover = pointer near projected label).
- Glide-to-chamber (~1.2 s): camera moves toward the chosen cluster; world dims
  (fog density up, non-selected clusters fade to ~15%); panels fade/slide in.
- **Reduced motion:** every flight becomes a ~0.4 s crossfade between static camera
  positions; rotation, drift and pulsing off; transport is a single crossfade.
- Tab hidden → RAF paused (existing pattern).

## 5. Accessibility & fallbacks

- All interactive elements are DOM buttons; scene changes move focus to the new scene's
  first control and announce via a polite `aria-live` region ("Inside the mind. Eight
  thinking moves around you.").
- Esc: skips transport; in chamber acts as "← All moves"; in list overlay closes it.
- "See as a list" is always reachable and is the guaranteed non-spatial path.
- Contrast: on the night background, labels use lightened tints of each move colour
  (`color-mix` with white) checked to ≥4.5:1; body/UI text near-white.
- **No WebGL / Three failed to load:** cover shows a static 2D brain (existing 2D canvas
  sampler kept as poster fallback); Enter goes straight to the list overlay on the night
  background; chamber works identically. Feature is progressive enhancement end-to-end.
- Performance: DPR capped at 2 (1.5 mobile), particle budgets per §3, single RAF,
  no per-frame allocations in the hot loop; target 60 fps desktop / 30+ fps mobile.

## 6. What is removed / kept

- **Removed (brain view only):** scroll-driven zoom (ScrollTrigger scrub), Lenis smooth
  scroll, `.bx-dive` interstitial, `.bx-map` editorial index section, 2D hero canvas as
  primary renderer (kept only as no-WebGL poster), scroll cue.
- **Kept:** masthead (Springboard word, About, Classic view), all engine state and API
  calls, the tool's three panels + routines + slide cards + download, slide preview
  overlay, footer credit content (moves to an "About" surface reachable from the mast),
  `BX_COLOR`, analytics events exactly as they are (no new event names).
- Classic view code path: zero changes.

## 7. Testing & verification

- Gates before every commit: `npm test`, `npm run check:ui` (only real frontend gate).
- Browser passes (chrome-devtools MCP): cover render + Enter; transport completes and is
  skippable; 8 labels track clusters while drifting; list overlay path; chamber
  readability screenshots; reduced-motion emulation (crossfades only); WebGL-blocked
  fallback; 390 px mobile pass; console clean of errors.
- Contrast spot-checks for night-world text tints.
- Version: bump `APP_VERSION` only when this ever ships to live (not while sandboxed).

## 8. Success criteria

- A first-time visitor understands within 5 seconds: brain, one sentence, one button.
- Transport produces a genuine "travelled somewhere" moment yet never blocks a teacher
  more than one click/keypress from skipping.
- A move can be chosen and a deck generated end-to-end entirely inside the night world
  with no regression to generate/download behaviour.
- Reduced-motion and no-WebGL users can complete the same task with equal clarity.
