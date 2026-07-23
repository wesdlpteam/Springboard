# Watercolour rebuild — implementation brief (2026-07-23)

Nathan approved: retire the space/neon theme; rebuild the brain experience as Wesley
ink-and-watercolour on paper ("option 2", richer generated artwork).

## Assets (docs/superpowers/inspiration/2026-07-23-watercolour/)
- `wc-cover.png` — approved blue ink-wash brain, warm white paper, 2752x1536 (sparkle removed)
- `bloom-{purple,gold,red,orange,yellow,green,blue,olive,periwinkle}.png` — 683px cells cut
  from the nine-bloom grid; multiply-blend onto paper (white bg disappears)
- `wc-cover-paint-v1.mp4` — Seedance paint-in v1 (desk/stripes — fallback only). v2 with
  flat lighting rendering now; when it lands: play on cover load, crossfade to still.
- `wc-chamber.png` — NOT YET DELIVERED (soft grey-cream wash; tint per move in CSS).
  Placeholder until then: CSS radial wash in move colour over paper.

## Design (locked with Nathan)
- Paper ground `#F7F4EE`→`#EFEAE0`, SVG grain overlay. Type: Graphik stack; Avenir Black h1.
  Roles per Wesley kit: gold headline / purple standfirst on white; purple = ONLY interactive.
- Cover: mock-watercolour.html's cover layout, but art = wc-cover.png (contain, right,
  multiply over paper, edge-feather mask). Paint-in on load: SVG turbulence-mask reveal
  (until v2 video lands). Enter = ink-wash dissolve (turbulence mask wipe), NO video needed.
- Map: paper bg. Hub = bloom-gold centre (~50%, 52%). Eight moves = bloom PNGs (multiply)
  at mock-ish positions; labels = light pills (white glass, ink text, colour dot).
  Cords: CODE-DRAWN wobbly ink SVG paths (turbulence filter) node→hub — geometry owned by
  code so the existing pulse engine (pulseGeomRef/firePulse) rides them exactly.
  Title lockup: gold kicker + purple "Thinking Moves" (from mock), top-centre.
- Move→bloom map: Capture=red, Uncovering=purple, Reason=olive, Wondering=blue,
  Build=green, Consider=yellow, Make=orange, Describe=periwinkle. Hub=gold.
- Dive: clicked bloom's colour washes over screen (expanding turbulence mask) → chamber.
  Chamber: light theme (paper panels, ink text), backdrop = wc-chamber tinted to move
  (placeholder: CSS wash). Esc/back = reverse wash.
- Keep: bxScene state machine, chooseMove/leaveChamber/diveToInside timers, pulse engine,
  a11y (announce, focus restore, focus-visible gate), listOpen overlay, Classic view.
- Kill: tunnel video, cover-living remnants, bw-night dark ground, IMG_MOVE_POS artwork
  calibration (map positions are now viewport fractions — no photo to align to).

## Verify contract (memory: live-motion-review-workflow)
Film headless at 1446x651 (Nathan's aspect), full-res frames for judgement calls,
taste items -> "needs your eyes". Gates: npm run check:ui + npm test before commit.
