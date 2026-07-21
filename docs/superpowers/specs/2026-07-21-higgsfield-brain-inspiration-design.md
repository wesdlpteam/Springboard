# Higgsfield brain-experience inspiration pack — design

Date: 2026-07-21
Status: approved by Nathan (conversation), pending spec review
Scope: design-inspiration image generation only. Code tuning of the sandbox is a
separate follow-up plan.

## Goal

Produce a small "north star" reference pack of AI-generated concept images for the
three stages of the Brain World experience (cover brain, inside view, chamber),
chosen by Nathan, plus a one-page art-direction note. This ends the guess-and-reject
cycle of hand-coding the brain look (5 rounds so far) by giving the code a concrete
visual target.

## Non-negotiable attribute

Every image must **instantly read as a real brain**: anatomically believable side
profile, proper gyri/folds, cerebellum, stem. NOT a hand-drawn or icon-style brain.
Style and colour are open — glowing blue is NOT required.

## Tooling

- Higgsfield CLI (`higgsfield`, installed globally, v1.1.19), workspace "Private",
  starter plan, 280 credits at start.
- Image models: two different models per round for genuine variety (candidates:
  `nano_banana_pro` 2cr, `flux_2` 1cr, `seedream_v4_5` 1cr). ~1–2 credits/image.
- Total budget ceiling for the whole exercise: **~40 credits**. Stop and check with
  Nathan before exceeding.

## Rounds

**Round 1 — cover-brain style test (8 images, ~12 credits).**
One subject (the cover brain on/over a background with headline space), four style
lanes × two models:
1. Luminous glow (near-white/blue light brain on deep night — the earlier reference)
2. Cinematic realistic (beautifully studio-lit, photographic, dark backdrop)
3. Sculptural editorial (brain as elegant object; closer to the original porcelain
   paper aesthetic)
4. Cosmic particles (brain formed of stars/dust)

Every lane keeps the non-negotiable: real brain anatomy. The 8 Wesley move colours
appear as small points of light in the brain where the lane allows.

Nathan picks the winning style (and any winning images).

**Round 2 — journey in the winning style (~8 images, ~12 credits).**
- Inside view: the feeling of being inside the brain — depth, mist, 8 glowing move
  clusters in the official Wesley move colours, room below clusters for labels. 4 images.
- Chamber: close on ONE move cluster (Wondering blue), others dimmed, calm (no
  flashing). 4 images.

**Round 3 — refinement (~6 images, ~6–9 credits).**
Regenerate winners with Nathan's fixes. Skip if round 2 already lands.

## Review flow

- Images download into `docs/superpowers/inspiration/2026-07-21-brain-journey/`
  inside this worktree. **Folder is git-ignored — generated images are never
  committed to the public repo.**
- Each round produces a local contact-sheet HTML (numbered grid) opened in Nathan's
  browser. Nathan replies with numbers he likes or "none, because…".

## Deliverables

1. `north-star/` subfolder containing only the chosen winners.
2. `docs/superpowers/specs/2026-07-21-brain-art-direction.md` — one page describing
   the chosen look in words (palette, light, mood, composition) for the code-tuning
   work to target.
3. Follow-up: implementation plan (separate doc, writing-plans skill) to tune the
   sandbox `index.html` brain to match — or, if Nathan later chooses, to ship a
   generated image directly.

## Safety

- Prompts contain no student/staff/personal data — only art direction words.
- Generated images stay local (git-ignored); nothing uploads anywhere except the
  prompt text to Higgsfield.
- No changes to app code in this piece of work.

## Out of scope

- Any edits to sandbox or live `index.html`.
- Video generation.
- Merging/pushing the worktree branch (never without Nathan's OK).
