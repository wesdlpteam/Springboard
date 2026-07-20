# Brain World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sandbox's scroll-film brain experience with a click-to-enter 3D journey: rotating particle brain cover → dive transport → deep-night constellation space for choosing a thinking move → dark chamber running the existing lesson tool.

**Architecture:** Everything lives in the single `index.html` (project rule: one file, no build). One persistent Three.js scene behind the DOM; React state `bxScene` ("cover" | "transport" | "inside" | "chamber") drives DOM overlays; an imperative API on a ref (`brainApi`) drives camera flights so scene changes never rebuild the 3D world. All text/controls are real DOM. Classic view code path untouched.

**Tech Stack:** Three.js 0.150.1 (UMD build, `window.THREE`, pinned SRI — the last UMD line; ships every API we use: PerspectiveCamera, Points, LineSegments, FogExp2, AdditiveBlending), GSAP 3.12.5 (already loaded) for camera tweens, React 18 in-browser Babel (existing).

## Global Constraints

- Sandbox worktree only: `.claude/worktrees/ui-mindmap/index.html`. Never merge/push to `main` without Nathan's OK.
- Gates before EVERY commit: `npm run check:ui` AND `npm test` (run from the worktree root).
- CSP `script-src` already allows `https://cdn.jsdelivr.net` — do not touch the CSP meta.
- All CDN scripts pinned version + `integrity` + `crossorigin="anonymous"` (house pattern, index.html:21-28).
- Reduced-motion alternative for every animation (`prefers-reduced-motion: reduce` → crossfades, no flights, no drift).
- WCAG 2.2 AA: night-world text ≥4.5:1 against its surface; verify with browser eval, not eyeball.
- No new analytics event names. No teacher/student identity. Engine calls (`pickMove`, `runAnalyse`, `generate`, download) unchanged.
- Do NOT bump `APP_VERSION` (sandbox never deploys).
- Existing scroll experience (`.bx-hero`/`.bx-dive`/`.bx-map` JSX, ScrollTrigger zoom, Lenis) is REMOVED from the brain view; classic view (`brainView === false`) must be byte-identical in behavior.
- Naming: new CSS classes prefixed `bw-` (brain world); existing `bx-` classes reused where the element survives (tool, mast, buttons).

## File Structure

- Modify: `.claude/worktrees/ui-mindmap/index.html` — head (one script tag), `<style>` (new `bw-` block + `.bw-night` overrides), the Babel block (state, one Three `useEffect`, render functions).
- Modify: `.claude/worktrees/ui-mindmap/docs/superpowers/specs/2026-07-21-brain-world-design.md` — §2 one-line amendment (UMD r150 instead of ESM; same guarantees).
- No other files. No backend changes. `test/` untouched (backend tests must simply stay green).

## Verification model (applies to every task)

This project has no frontend unit tests; the compile gate + scripted browser checks are the test cycle (house rule, CLAUDE.md). "Browser verify" steps mean: reload the already-open chrome-devtools MCP page on the worktree `index.html` (file:// URL), wait ~4s for Babel, then assert via `evaluate_script` and screenshot. A task is done only when its listed assertions pass and the console has no new errors (`list_console_messages`, ignore the known file:-origin warning and Babel dev warning).

---

### Task 1: Pin Three.js in the head

**Files:**
- Modify: `.claude/worktrees/ui-mindmap/index.html:18` (insert after the Lenis line)
- Modify: `.claude/worktrees/ui-mindmap/docs/superpowers/specs/2026-07-21-brain-world-design.md` (§2 first bullet)

**Interfaces:**
- Produces: `window.THREE` (r150 namespace) available to the Babel block. Later tasks call `new THREE.WebGLRenderer/PerspectiveCamera/Scene/BufferGeometry/Points/LineSegments/PointsMaterial/LineBasicMaterial/FogExp2/Vector3/Color`.

- [ ] **Step 1: Compute the SRI hash**

```powershell
cd "$env:TEMP"; curl.exe -sL "https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.min.js" -o three.min.js
node -e "const c=require('crypto'),f=require('fs');console.log('sha384-'+c.createHash('sha384').update(f.readFileSync('three.min.js')).digest('base64'))"
```
Expected: one line starting `sha384-`. Sanity: file size ≈ 600–700 KB.

- [ ] **Step 2: Add the script tag** (after line 18, the Lenis script)

```html
<!-- Three.js r150 UMD (window.THREE) — Brain World 3D scene. Last UMD release; APIs used are all stable since r120. -->
<script crossorigin="anonymous" integrity="sha384-<PASTE FROM STEP 1>" src="https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.min.js"></script>
```

- [ ] **Step 3: Amend spec §2** — replace the sentence "Modern Three ships ES modules only, so it loads in a `<script type="module">` … before the Babel block runs." with: "Three 0.150.1 is the last UMD release; it loads as a classic pinned+SRI script exposing `window.THREE`, matching the house CDN pattern exactly."

- [ ] **Step 4: Gates + browser verify**

Run: `npm run check:ui` then `npm test` → both green.
Browser: reload page, `evaluate_script`: `() => window.THREE && window.THREE.REVISION` → `"150"`. Console: no new errors (an SRI mismatch shows as a blocked-script error — if so, re-do Step 1).

- [ ] **Step 5: Commit**

```bash
git add index.html docs/superpowers/specs/2026-07-21-brain-world-design.md
git commit -m "feat(sandbox): pin three r150 UMD for Brain World"
```

---

### Task 2: World scaffold — cover scene with rotating 3D brain, scroll experience removed

**Files:**
- Modify: `.claude/worktrees/ui-mindmap/index.html` — `<style>` block (new `bw-` CSS), Babel block (state + Three effect + `renderBrainWorld()`), brain-view JSX.

**Interfaces:**
- Consumes: `window.THREE`, `BX_COLOR`, existing `BRAIN_D` sampling technique, `gsap`.
- Produces (later tasks rely on these exact names):
  - State: `const [bxScene, setBxScene] = useState("cover")`, `const [glOk, setGlOk] = useState(true)`, `const sceneRef = useRef("cover")` (kept in sync).
  - Refs: `brainGlRef` (canvas), `brainApi` (`useRef(null)`) — Task 2 stores `{ setNight(v01), dispose }`; Task 3 adds `enter(onArrived)`, `skipToInside()`; Task 4 adds cluster data + `labelEls`; Task 5 adds `toChamber(i, onArrived)`, `toInside()`.
  - DOM: `<div className="bw-night" ref={nightRef} />` (fixed, z 0), `<canvas className="bw-gl" ref={brainGlRef} />` (fixed, z 1), overlays z 2+. `.bw-on-night` class on the brain-view root when `bxScene !== "cover"`.
  - Three world object stored in effect closure: `world = { renderer, scene, camera, brainGroup, inkPts, glowPts, inkLines, glowLines, specks, reduce }`.

- [ ] **Step 1: Add `bw-` CSS** (append inside the existing `<style>`, after the `.bx-foot` rules)

```css
/* ---------- Brain World (bw-) ---------- */
.bw-night { position: fixed; inset: 0; z-index: 0; background: #101017; opacity: 0; transition: opacity .5s; pointer-events: none; }
.bw-on-night .bw-night { opacity: 1; }
.bw-gl { position: fixed; inset: 0; z-index: 1; width: 100%; height: 100%; display: block; }
.bw-scene { position: fixed; inset: 0; z-index: 2; display: grid; place-items: center; text-align: center; padding: 24px; }
.bw-cover .bx-kicker { display: block; margin-bottom: 18px; }
.bw-cover h1 { font-family: var(--bx-display); font-weight: 400; font-size: clamp(40px, 5.4vw, 84px); line-height: 1.02; letter-spacing: -.025em; margin: 0; text-wrap: balance; max-width: 14ch; }
.bw-cover h1 em { font-style: italic; }
.bw-cover .bw-sub { margin: 20px 0 0; color: var(--ink-soft); font-size: clamp(14px,1.3vw,17px); max-width: 44ch; }
.bw-enter { margin-top: 36px; display: inline-flex; align-items: center; gap: 12px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font: inherit; font-size: 15px; letter-spacing: .02em; padding: 14px 30px; border-radius: 999px; cursor: pointer; transition: transform .15s, box-shadow .2s; }
.bw-enter:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(16,16,23,.25); }
.bw-enter:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
.bw-on-night .bx-mast { background: linear-gradient(to bottom, rgba(16,16,23,.9) 55%, transparent); }
.bw-on-night .bx-mast .bx-word, .bw-on-night .bx-mast .bx-nav a, .bw-on-night .bx-mast .bx-nav button { color: #d9d9e3; }
.bw-on-night .bx-mast .bx-nav a:hover, .bw-on-night .bx-mast .bx-nav button:hover { color: #fff; }
.bw-on-night .bx-tog { border-color: rgba(255,255,255,.35); }
@media (prefers-reduced-motion: reduce) { .bw-night { transition: opacity .4s; } }
```

The brain-view root div gets `className={"bx" + (bxScene !== "cover" ? " bw-on-night" : "")}`; body scroll is locked in brain view (`useEffect` toggling `document.body.style.overflow = brainView ? "hidden" : ""`), since Brain World is scene-based, not scroll-based.

- [ ] **Step 2: Replace the brain-view JSX.** Delete from the brain-view return: the whole `<section className="bx-hero">…</section>`, `<section className="bx-dive">…</section>`, `<section className="bx-map">…</section>`, `<div className="bx-cue">`, and the `<footer className="bx-foot">` (its credit line moves into the cover sub-line "Built on the Cultures of Thinking moves · Harvard Project Zero" rendered small under the Enter button). Keep the mast. New body:

```jsx
<div className="bw-night" ref={nightRef} aria-hidden="true" />
<canvas className="bw-gl" ref={brainGlRef} aria-hidden="true" />
{bxScene === "cover" && (
  <div className="bw-scene bw-cover">
    <div>
      <span className="bx-kicker">A thinking tool for Wesley teachers</span>
      <h1>Every lesson begins in the <em>mind.</em></h1>
      <p className="bw-sub">Springboard turns a photograph, a film or an article into a Project Zero thinking lesson — ready in about two minutes.</p>
      <button className="bw-enter" autoFocus onClick={enterMind}>Enter the mind →</button>
      <p className="bw-sub" style={{ fontSize: 12.5, opacity: .75, marginTop: 26 }}>Eight thinking moves · Cultures of Thinking · <a href="https://pz.harvard.edu/thinking-routines" target="_blank" rel="noopener">Harvard Project Zero</a></p>
    </div>
  </div>
)}
```
`enterMind` for now: `const enterMind = () => {};` (Task 3 fills it). Old 2D-canvas hero effect (the whole `useEffect` with `buildBrain`/ScrollTrigger/Lenis): extract its silhouette sampler into a top-level function `sampleBrainSilhouette(count)` (below `BX_COLOR`), delete the rest of the effect. Sampler, exact code:

```js
// Rasterise the Lucide brain paths offscreen, return `count` normalized points
// [x,y] in roughly [-1,1] (aspect preserved, centred). Returns [] on any failure.
function sampleBrainSilhouette(count) {
  const BRAIN_D = ["M12 18V5", "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4", "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5", "M17.997 5.125a4 4 0 0 1 2.526 5.77", "M18 18a4 4 0 0 0 2-7.464", "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517", "M6 18a4 4 0 0 1-2-7.464", "M6.003 5.125a4 4 0 0 0-2.526 5.77"];
  const S = 600, pad = 96;
  let g; try { const oc = document.createElement("canvas"); oc.width = oc.height = S; g = oc.getContext("2d", { willReadFrequently: true }); } catch (e) { return []; }
  g.strokeStyle = "#000"; g.lineJoin = g.lineCap = "round";
  const sc = (S - pad * 2) / 24; g.setTransform(sc, 0, 0, sc, pad, pad); g.lineWidth = 1.7;
  for (const d of BRAIN_D) { try { g.stroke(new Path2D(d)); } catch (e) {} }
  let data; try { data = g.getImageData(0, 0, S, S).data; } catch (e) { return []; }
  const raw = [];
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) if (data[(y * S + x) * 4 + 3] > 40) raw.push([x, y]);
  if (!raw.length) return [];
  for (let i = raw.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = raw[i]; raw[i] = raw[j]; raw[j] = t; }
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const p of raw) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, half = Math.max(maxx - minx, maxy - miny) / 2 || 1;
  return raw.slice(0, Math.min(count, raw.length)).map(p => [(p[0] - cx) / half, -(p[1] - cy) / half]);
}
```

- [ ] **Step 3: The Three effect.** One `useEffect(..., [brainView])`:

```js
useEffect(() => {
  if (!brainView) return;
  const T = window.THREE, canvas = brainGlRef.current;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!T || !canvas) { setGlOk(false); return; }
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); }
  catch (e) { setGlOk(false); return; }
  const mobile = window.innerWidth < 900;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0); // transparent: porcelain page shows through on the cover
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(55, 1, 0.1, 120);
  camera.position.set(0, 0.12, 4.3);
  const N_PTS = mobile ? 2200 : 6000;
  const flat = sampleBrainSilhouette(N_PTS);
  // give the silhouette volume: depth budget shrinks toward the rim
  const pos = new Float32Array(flat.length * 3), inkCol = new Float32Array(flat.length * 3), glowCol = new Float32Array(flat.length * 3);
  const ink = new T.Color("#17171d"), glow = new T.Color("#8f93b4"), tmp = new T.Color();
  const moveCols = Object.values(BX_COLOR).map(c => new T.Color(c));
  for (let i = 0; i < flat.length; i++) {
    const x = flat[i][0] * 1.6, y = flat[i][1] * 1.6;
    const r = Math.min(1, Math.hypot(flat[i][0], flat[i][1]));
    const z = (Math.random() * 2 - 1) * Math.sqrt(Math.max(0.02, 1 - r * r)) * 0.85;
    pos.set([x + (Math.random() - .5) * .05, y + (Math.random() - .5) * .05, z], i * 3);
    const accent = Math.random() < 0.1 ? moveCols[(Math.random() * moveCols.length) | 0] : null;
    tmp.copy(accent || ink); inkCol.set([tmp.r, tmp.g, tmp.b], i * 3);
    tmp.copy(accent ? accent.clone().lerp(new T.Color("#ffffff"), 0.25) : glow); glowCol.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(pos, 3));
  const mkPts = (colors, opacity, blending) => {
    const g2 = geo.clone(); g2.setAttribute("color", new T.BufferAttribute(colors, 3));
    const m = new T.PointsMaterial({ size: 0.028, vertexColors: true, transparent: true, opacity, depthWrite: false, blending, sizeAttenuation: true });
    return new T.Points(g2, m);
  };
  const inkPts = mkPts(inkCol, 0.9, T.NormalBlending);
  const glowPts = mkPts(glowCol, 0, T.AdditiveBlending);
  // synapse lines: nearest neighbour over a subset
  const L = mobile ? 700 : 1600, lp = new Float32Array(L * 6);
  for (let i = 0; i < L; i++) {
    const a = (Math.random() * flat.length) | 0; let best = -1, bd = 1e9;
    for (let t = 0; t < 24; t++) { const b = (Math.random() * flat.length) | 0; if (b === a) continue;
      const dx = pos[a*3]-pos[b*3], dy = pos[a*3+1]-pos[b*3+1], dz = pos[a*3+2]-pos[b*3+2], dd = dx*dx+dy*dy+dz*dz;
      if (dd < bd) { bd = dd; best = b; } }
    lp.set([pos[a*3], pos[a*3+1], pos[a*3+2], pos[best*3], pos[best*3+1], pos[best*3+2]], i * 6);
  }
  const lgeo = new T.BufferGeometry(); lgeo.setAttribute("position", new T.BufferAttribute(lp, 3));
  const inkLines = new T.LineSegments(lgeo, new T.LineBasicMaterial({ color: 0x1c1c22, transparent: true, opacity: 0.3, depthWrite: false }));
  const glowLines = new T.LineSegments(lgeo.clone(), new T.LineBasicMaterial({ color: 0x6f74a0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
  const brainGroup = new T.Group(); brainGroup.add(inkPts, glowPts, inkLines, glowLines); scene.add(brainGroup);
  // far specks for depth once inside
  const SN = 800, sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) { const R = 18 + Math.random() * 40, th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1);
    sp.set([R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th)], i * 3); }
  const sgeo = new T.BufferGeometry(); sgeo.setAttribute("position", new T.BufferAttribute(sp, 3));
  const specks = new T.Points(sgeo, new T.PointsMaterial({ color: 0x50546e, size: 0.35, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }));
  scene.add(specks);
  const world = { renderer, scene, camera, brainGroup, inkPts, glowPts, inkLines, glowLines, specks, reduce };
  brainApi.current = {
    world,
    setNight(v) { // 0 = porcelain cover, 1 = deep night
      inkPts.material.opacity = 0.9 * (1 - v); inkLines.material.opacity = 0.3 * (1 - v);
      glowPts.material.opacity = 0.95 * v; glowLines.material.opacity = 0.45 * v;
      specks.material.opacity = 0.6 * v;
    },
  };
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); window.addEventListener("resize", resize);
  let raf = 0, tPrev = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame); if (document.hidden) return;
    const dt = Math.min(0.05, (now - tPrev) / 1000 || 0.016); tPrev = now;
    if (!reduce && sceneRef.current === "cover") brainGroup.rotation.y += dt * (2 * Math.PI / 12);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize);
    renderer.dispose(); geo.dispose(); lgeo.dispose(); sgeo.dispose(); brainApi.current = null; };
}, [brainView]);
```

Plus the sync effect: `useEffect(() => { sceneRef.current = bxScene; }, [bxScene]);`

- [ ] **Step 4: Gates + browser verify**

`npm run check:ui` + `npm test` green. Browser assertions:
- `() => !!document.querySelector(".bw-gl") && !document.querySelector(".bx-hero") && !document.querySelector(".bx-map")` → `true`
- `() => { const c = document.querySelector(".bw-gl"); const gl = c.getContext("webgl2")||c.getContext("webgl"); return !!gl; }` → `true`
- Screenshot: porcelain page, centred headline + Enter button, ink 3D brain rotating behind (take two screenshots 2 s apart — brain orientation must differ; a static brain means the RAF is dead).
- `() => window.scrollY === 0 && document.body.style.overflow === "hidden"` → `true` (no scroll).
- Classic view: click "Classic view", screenshot — must look exactly as before this task.

- [ ] **Step 5: Commit** — `git add index.html && git commit -m "feat(sandbox): Brain World cover — rotating 3D particle brain, scroll experience removed"`

---

### Task 3: Transport — dive into the night

**Files:**
- Modify: `.claude/worktrees/ui-mindmap/index.html` (Babel block: `enterMind`, `brainApi.enter`, Esc handling; CSS: cover fade-out class)

**Interfaces:**
- Consumes: `brainApi.current.world`, `setNight`, `gsap`, `sceneRef`, `setBxScene`.
- Produces: `brainApi.current.enter(onArrived)`, `brainApi.current.skipToInside()`; camera "inside" home position `INSIDE_POS = {x:0, y:0, z:0.001}` (looking down −z); `bxScene` transitions cover→transport→inside; a polite live region `<span className="sr-only" aria-live="polite" ref={liveRef} />` and helper `announce(msg)` (sets textContent). `.sr-only` CSS: `position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap;`.

- [ ] **Step 1: Implement `enter` inside the Three effect** (attach to `brainApi.current`):

```js
enter(onArrived) {
  const done = () => { camera.position.set(0, 0, 0.001); camera.lookAt(0, 0, -1);
    brainGroup.rotation.set(0, 0, 0); this.setNight(1); onArrived(); };
  if (reduce) { done(); return; }
  const st = { z: camera.position.z, n: 0, size: 0.028 };
  this._tw = gsap.to(st, { z: -2.6, n: 1, size: 0.05, duration: 3.4, ease: "power2.inOut",
    onUpdate: () => { camera.position.z = st.z; this.setNight(st.n);
      glowPts.material.size = st.size; camera.lookAt(0, 0, Math.min(0, st.z - 1)); },
    onComplete: () => { glowPts.material.size = 0.028; done(); } });
},
skipToInside() { if (this._tw) this._tw.kill(); glowPts.material.size = 0.028;
  camera.position.set(0, 0, 0.001); camera.lookAt(0, 0, -1); brainGroup.rotation.set(0, 0, 0); this.setNight(1); },
```

- [ ] **Step 2: Wire the React side**

```js
const enterMind = () => {
  if (!glOk || !brainApi.current) { setBxScene("inside"); return; } // fallback path (Task 6 completes it)
  setBxScene("transport");
  brainApi.current.enter(() => { setBxScene("inside"); announce("Inside the mind. Eight thinking moves around you."); });
};
useEffect(() => {
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (sceneRef.current === "transport" && brainApi.current) { brainApi.current.skipToInside(); setBxScene("inside"); }
  };
  window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
}, []);
```
During `bxScene === "transport"` render a full-screen click-catcher that also skips: `<button className="bw-scene" style={{ background: "none", border: 0, cursor: "default" }} aria-label="Skip the flight" onClick={() => { brainApi.current.skipToInside(); setBxScene("inside"); }} />`. The cover overlay unmounts when the scene leaves "cover" (its fade handled by the night layer coming up over 0.5 s).

- [ ] **Step 3: Gates + browser verify**

- Click Enter → after ≤4 s, `() => document.querySelector(".bw-night") && getComputedStyle(document.querySelector(".bw-night")).opacity` → `"1"`, and root has class `bw-on-night`; mast text light. Screenshot mid-flight (~1.5 s in): particles enlarged/streaking, porcelain fading.
- Reload; click Enter then press Esc within 1 s → immediately inside (night on, no tween running: `() => !window.gsap.globalTimeline.getChildren().length` or simply screenshot shows settled night world).
- Reduced motion: `emulate` reduced-motion `reduce` (chrome-devtools `emulate` tool), reload, click Enter → arrives instantly (no 3.4 s wait).
- Gates green.

- [ ] **Step 4: Commit** — `git commit -am "feat(sandbox): transport flight — dive through the brain into the night world"`

---

### Task 4: Constellation space — eight moves floating, list fallback

**Files:**
- Modify: `.claude/worktrees/ui-mindmap/index.html` (Three effect: clusters; Babel: labels render + projection loop + list overlay; CSS)

**Interfaces:**
- Consumes: `MOVES` (existing array of 8 `{name, question}`), `BX_COLOR`, world objects, `onPickBrainMove(name)` (existing, calls `pickMove` + scroll — Task 5 rewires it).
- Produces: `clusters[i] = { center: THREE.Vector3, group, ptsMat, lineMat }` on `brainApi.current`; `labelEls = useRef([])`; `hoveredRef = useRef(-1)`; `const [listOpen, setListOpen] = useState(false)`; CSS classes `.bw-label`, `.bw-list`, `.bw-listbtn`; per-move light text tint `bwTint(name)`:

```js
// Night-world text tint: move colour lifted toward white for AA on #101017.
const BW_TINT = Object.fromEntries(Object.entries(BX_COLOR).map(([k, v]) => {
  const c = parseInt(v.slice(1), 16), r = c >> 16, g = (c >> 8) & 255, b = c & 255;
  const L = (x) => Math.round(x + (255 - x) * 0.45);
  return [k, "rgb(" + L(r) + "," + L(g) + "," + L(b) + ")"];
}));
const bwTint = (name) => BW_TINT[name] || "#e6e6ee";
```

- [ ] **Step 1: Build clusters in the Three effect** (after specks):

```js
// eight constellations in a 150° frontal fan so all are visible at once
const clusters = [];
const MOVE_NAMES = MOVES.map(m => m.name);
MOVE_NAMES.forEach((name, i) => {
  const az = (-75 + (150 / 7) * i) * Math.PI / 180;
  const R = 7 + (i % 3) * 0.8, Y = [1.4, -0.6, 0.7, -1.2, 1.1, -0.2, 1.7, -0.9][i];
  const center = new T.Vector3(Math.sin(az) * R, Y, -Math.cos(az) * R);
  const n = 80, cp = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), rr = Math.pow(Math.random(), 0.6) * 0.6;
    cp.set([center.x + rr * Math.sin(ph) * Math.cos(th), center.y + rr * Math.cos(ph), center.z + rr * Math.sin(ph) * Math.sin(th)], k * 3);
  }
  const cg = new T.BufferGeometry(); cg.setAttribute("position", new T.BufferAttribute(cp, 3));
  const col = new T.Color(BX_COLOR[name]).lerp(new T.Color("#ffffff"), 0.2);
  const ptsMat = new T.PointsMaterial({ color: col, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
  const pts2 = new T.Points(cg, ptsMat);
  const LN = 46, ll = new Float32Array(LN * 6);
  for (let k = 0; k < LN; k++) { const a = (Math.random() * n) | 0, b = (Math.random() * n) | 0;
    ll.set([cp[a*3], cp[a*3+1], cp[a*3+2], cp[b*3], cp[b*3+1], cp[b*3+2]], k * 6); }
  const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.BufferAttribute(ll, 3));
  const lineMat = new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
  const group = new T.Group(); group.add(pts2, new T.LineSegments(lg, lineMat)); scene.add(group);
  clusters.push({ center, group, ptsMat, lineMat, drift: Math.random() * 6.283 });
});
brainApi.current.clusters = clusters;
```
`setNight` gains: `clusters.forEach(c => { c.ptsMat.opacity = 0.9 * v; c.lineMat.opacity = 0.35 * v; });`

- [ ] **Step 2: Per-frame label projection + drift + hover pulse** (inside `frame`, after the cover rotation line):

```js
if (sceneRef.current === "inside" || sceneRef.current === "chamber") {
  const els = labelEls.current, v3 = frameV3; // frameV3 = new T.Vector3() hoisted outside frame()
  brainApi.current.clusters.forEach((c, i) => {
    if (!reduce) { c.group.position.y = Math.sin(now * 0.0004 + c.drift) * 0.18;
      const target = hoveredRef.current === i ? 1.14 : 1; const s = c.group.scale.x + (target - c.group.scale.x) * 0.08; c.group.scale.setScalar(s); }
    const el = els[i]; if (!el) return;
    v3.copy(c.center); v3.y += c.group.position.y; v3.project(camera);
    const off = v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1;
    el.style.opacity = off ? "0" : "1"; el.style.pointerEvents = off ? "none" : "";
    el.style.transform = "translate(-50%,-46%) translate(" + ((v3.x * 0.5 + 0.5) * canvas.clientWidth).toFixed(1) + "px," + ((-v3.y * 0.5 + 0.5) * canvas.clientHeight).toFixed(1) + "px)";
  });
  if (!reduce && sceneRef.current === "inside") { camera.rotation.y = Math.sin(now * 0.00013) * 0.035; }
}
```

- [ ] **Step 3: Inside-scene DOM.** Rendered when `bxScene === "inside"` (fixed layer z 2, NOT display:grid — labels position themselves):

```jsx
<div className="bw-inside">
  {MOVES.map((m, i) => (
    <button key={m.name} ref={el => { labelEls.current[i] = el; }} className="bw-label" style={{ "--bwt": bwTint(m.name) }}
      onMouseEnter={() => { hoveredRef.current = i; }} onMouseLeave={() => { hoveredRef.current = -1; }}
      onFocus={() => { hoveredRef.current = i; }} onBlur={() => { hoveredRef.current = -1; }}
      onClick={() => chooseMove(m.name)}>
      <span className="bw-label-name">{m.name}</span>
      <span className="bw-label-q">{m.question}</span>
    </button>
  ))}
  <button className="bw-listbtn" onClick={() => setListOpen(true)}>See as a list</button>
  {listOpen && (
    <div className="bw-list" role="dialog" aria-modal="true" aria-label="The eight thinking moves">
      <button className="bw-list-close" aria-label="Close list" onClick={() => setListOpen(false)}>×</button>
      {MOVES.map((m, i) => (
        <button key={m.name} className="bw-list-row" style={{ "--bwt": bwTint(m.name) }} onClick={() => { setListOpen(false); chooseMove(m.name); }}>
          <i /><b>{m.name}</b><span>{m.question}</span>
        </button>
      ))}
    </div>
  )}
</div>
```
`chooseMove(name)` in this task: `pickMove(name); setBxScene("chamber");` (glide added in Task 5). Esc handler gains: list open → close list; scene "chamber" → handled Task 5. On entering "inside", focus the first label: `useEffect(() => { if (bxScene === "inside") setTimeout(() => labelEls.current[0] && labelEls.current[0].focus(), 60); }, [bxScene]);`

CSS:

```css
.bw-inside { position: fixed; inset: 0; z-index: 2; }
.bw-label { position: absolute; left: 0; top: 0; background: none; border: 0; cursor: pointer; text-align: center; color: var(--bwt); font: inherit; padding: 10px 14px; transition: opacity .3s; will-change: transform; }
.bw-label-name { display: block; font-family: var(--bx-display); font-weight: 400; font-size: clamp(19px, 2vw, 27px); letter-spacing: -.01em; white-space: nowrap; text-shadow: 0 0 24px rgba(0,0,0,.9); }
.bw-label-q { display: block; font-size: 12.5px; color: #b9bac9; margin-top: 4px; white-space: nowrap; }
.bw-label:hover .bw-label-name, .bw-label:focus-visible .bw-label-name { text-decoration: underline; text-underline-offset: 5px; }
.bw-label:focus-visible { outline: 2px solid var(--bwt); outline-offset: 2px; border-radius: 6px; }
.bw-listbtn { position: fixed; right: clamp(20px,4vw,52px); bottom: 26px; background: none; border: 1px solid rgba(255,255,255,.3); color: #d9d9e3; font: inherit; font-size: 12.5px; padding: 8px 16px; border-radius: 999px; cursor: pointer; }
.bw-listbtn:hover { border-color: #fff; color: #fff; }
.bw-list { position: fixed; inset: 0; z-index: 5; background: rgba(16,16,23,.92); display: flex; flex-direction: column; justify-content: center; padding: 8vh clamp(24px,10vw,180px); gap: 2px; overflow: auto; }
.bw-list-row { display: grid; grid-template-columns: 14px 1fr; column-gap: 14px; align-items: baseline; text-align: left; background: none; border: 0; border-bottom: 1px solid rgba(255,255,255,.12); padding: 13px 4px; cursor: pointer; font: inherit; }
.bw-list-row i { width: 10px; height: 10px; border-radius: 50%; background: var(--bwt); align-self: center; }
.bw-list-row b { font-family: var(--bx-display); font-weight: 400; font-size: clamp(18px,2.4vw,26px); color: var(--bwt); }
.bw-list-row span { grid-column: 2; font-size: 13px; color: #b9bac9; margin-top: 3px; }
.bw-list-row:hover b { text-decoration: underline; text-underline-offset: 4px; }
.bw-list-close { position: absolute; top: 20px; right: 26px; background: none; border: 0; color: #d9d9e3; font-size: 26px; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .bw-label { transition: none; } }
```

- [ ] **Step 4: Gates + browser verify**

- Enter (or Esc-skip) → 8 `.bw-label` buttons, all visible on a 1440×900 desktop: `() => [...document.querySelectorAll(".bw-label")].filter(e => e.style.opacity !== "0").length` → `8`.
- Labels track drift: sample one label's `style.transform` twice 1.5 s apart → different values (unless reduced motion).
- Contrast: `() => [...document.querySelectorAll(".bw-label-name")].map(e => getComputedStyle(e).color)` — for each, compute WCAG ratio vs `#101017` in the eval (embed a 15-line luminance function in the eval script); every ratio ≥ 4.5. If any fails, raise that move's lift factor in `BW_TINT` from 0.45 until it passes (0.45 → 0.55 → 0.65 max).
- List path: click "See as a list" → dialog rows visible, Esc closes.
- Click "Wondering" label → `() => !!document.querySelector(".bx-tool")` (chamber DOM appears; styling is next task).
- Screenshot of the constellation space (the money shot — check it against §8 of the spec: does it feel like floating inside a mind?).
- Gates green.

- [ ] **Step 5: Commit** — `git commit -am "feat(sandbox): constellation space — eight moves floating in the night, list fallback"`

---

### Task 5: Chamber — glide, dim, dark tool

**Files:**
- Modify: `.claude/worktrees/ui-mindmap/index.html` (Three effect: `toChamber`/`toInside`; Babel: `chooseMove` rewire, back-out, Esc; CSS: `.bw-night-tool` overrides)

**Interfaces:**
- Consumes: `clusters`, `renderBrainTool()` (existing), `pickMove`, `selectedMove`, `bwTint`.
- Produces: `brainApi.current.toChamber(i, onArrived)`, `brainApi.current.toInside()`; the tool wrapped in `<div className="bw-chamber">` with `--mv` (existing) plus `--bwt: bwTint(selectedMove)`.

- [ ] **Step 1: Camera glide + dim in the Three effect:**

```js
toChamber(i, onArrived) {
  const c = clusters[i], p = c.center.clone().multiplyScalar(0.45);
  const go = () => { clusters.forEach((k, j) => { const on = j === i;
      gsap.to(k.ptsMat, { opacity: on ? 0.95 : 0.12, duration: reduce ? 0 : 0.8 });
      gsap.to(k.lineMat, { opacity: on ? 0.4 : 0.05, duration: reduce ? 0 : 0.8 }); });
    onArrived(); };
  if (reduce) { camera.position.copy(p); camera.lookAt(c.center); go(); return; }
  this._tw = gsap.to(camera.position, { x: p.x, y: p.y, z: p.z, duration: 1.2, ease: "power3.inOut",
    onUpdate: () => camera.lookAt(c.center), onComplete: go });
},
toInside() {
  clusters.forEach(k => { gsap.to(k.ptsMat, { opacity: 0.9, duration: reduce ? 0 : 0.6 });
    gsap.to(k.lineMat, { opacity: 0.35, duration: reduce ? 0 : 0.6 }); });
  if (reduce) { camera.position.set(0, 0, 0.001); camera.rotation.set(0, 0, 0); camera.lookAt(0, 0, -1); return; }
  this._tw = gsap.to(camera.position, { x: 0, y: 0, z: 0.001, duration: 1, ease: "power3.inOut",
    onUpdate: () => { }, onComplete: () => { camera.rotation.set(0, 0, 0); camera.lookAt(0, 0, -1); } });
},
```

- [ ] **Step 2: React wiring.** `chooseMove(name)`:

```js
const chooseMove = (name) => {
  pickMove(name);
  const i = MOVES.findIndex(m => m.name === name);
  if (brainApi.current && brainApi.current.toChamber) {
    setBxScene("glide"); // labels hidden, panels not yet up ("glide" renders nothing extra)
    brainApi.current.toChamber(i, () => { setBxScene("chamber"); announce(name + ". Build the lesson here."); });
  } else setBxScene("chamber");
};
const leaveChamber = () => { pickMove(""); if (brainApi.current && brainApi.current.toInside) brainApi.current.toInside(); setBxScene("inside"); };
```
Chamber render: `{bxScene === "chamber" && selectedMoveObj && <div className="bw-chamber" style={{ "--bwt": bwTint(selectedMove) }}>{renderBrainTool()}</div>}`. Inside `renderBrainTool`, change the back button to `onClick={leaveChamber}` and REMOVE the `scrollToId` calls (no scroll world anymore). Esc in chamber → `leaveChamber()` (add to the keydown effect; but NOT while the slide-preview overlay `openSlide` is up — that Esc belongs to the overlay). Focus: on entering chamber, focus the back button.

- [ ] **Step 3: Dark chamber CSS** (append):

```css
.bw-chamber { position: fixed; inset: 0; z-index: 2; overflow: auto; }
.bw-chamber .bx-tool { padding-top: 92px; min-height: 100%; }
.bw-chamber .bx-tool-head h2 { color: var(--bwt); }
.bw-chamber .bx-tool-head .bx-back { color: #b9bac9; } .bw-chamber .bx-tool-head .bx-back:hover { color: #fff; }
.bw-chamber .bx-tool-sub { color: #b9bac9; }
.bw-chamber .bx-panel { border-top-color: rgba(255,255,255,.5); background: rgba(22,22,30,.78); backdrop-filter: blur(6px); border-radius: 6px; padding: 18px 18px 22px; }
.bw-chamber .bx-panel > h3 { color: #ececf1; }
.bw-chamber .bx-panel > .bx-note, .bw-chamber .bx-panel .bx-step-n, .bw-chamber .bx-field label { color: #a9aabb; }
.bw-chamber .bx-input, .bw-chamber .bx-tool textarea, .bw-chamber .bx-tool select { background: #101017; color: #ececf1; border-color: rgba(255,255,255,.22); }
.bw-chamber .bx-input::placeholder, .bw-chamber .bx-tool textarea::placeholder { color: #9fa0b2; }
.bw-chamber .bx-input:focus, .bw-chamber .bx-tool textarea:focus, .bw-chamber .bx-tool select:focus { outline-color: var(--bwt); }
.bw-chamber .bx-modes { background: rgba(255,255,255,.08); } .bw-chamber .bx-modes button { color: #b9bac9; }
.bw-chamber .bx-modes button.on { background: #26262f; color: #fff; box-shadow: none; }
.bw-chamber .bx-drop { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.28); color: #ececf1; }
.bw-chamber .bx-drop:hover, .bw-chamber .bx-drop.drag { border-color: #fff; background: rgba(255,255,255,.08); }
.bw-chamber .bx-drop small, .bw-chamber .bx-working, .bw-chamber .bx-routine .rw, .bw-chamber .bx-routine .ri, .bw-chamber .bx-more summary { color: #a9aabb; }
.bw-chamber .bx-btn { background: #ececf1; color: #101017; }
.bw-chamber .bx-btn.mv { background: var(--mv); color: #fff; }
.bw-chamber .bx-btn.ghost { background: none; color: #ececf1; border-color: rgba(255,255,255,.4); }
.bw-chamber .bx-routine { border-bottom-color: rgba(255,255,255,.12); } .bw-chamber .bx-routine .rn { color: #ececf1; }
.bw-chamber .bx-routine.on .rn { color: var(--bwt); }
.bw-chamber .bx-card { background: rgba(22,22,30,.85); border-color: rgba(255,255,255,.2); }
.bw-chamber .bx-card:hover { border-color: #fff; }
.bw-chamber .bx-card .ck { color: #a9aabb; } .bw-chamber .bx-card .ct { color: #ececf1; }
.bw-chamber .bx-alert { background: rgba(143,29,46,.25); border-color: rgba(240,184,196,.4); color: #f6c9d2; }
```
Note: `backdrop-filter` here is functional (separating panels from the live neural field behind), not decorative default.

- [ ] **Step 4: Gates + browser verify**

- Full flow: Enter → skip → click a constellation → glide (screenshot mid-glide) → chamber panels legible (screenshot).
- Contrast eval on chamber: for `.bx-note`, `.bx-field label`, input text, placeholder, `.bx-tool-sub`, h2 (`--bwt`) — computed color vs the panel surface `rgb(22,22,30)`; every body-text ratio ≥ 4.5, h2 (large text) ≥ 3.0. Fix by lightening the failing token in the CSS above.
- "← All moves" → back to constellations, all clusters restored (opacity assert on one non-selected cluster material ≈ 0.9 — via `evaluate_script` reading `brainApi` is not possible from page; instead verify visually + labels visible again = 8).
- Esc in chamber returns to inside; Esc during slide preview only closes the preview.
- File-only limits: Suggest routines requires the backend — verify the disabled state + helper text reads correctly on dark; no console errors.
- Classic view still untouched (toggle + screenshot).
- Gates green.

- [ ] **Step 5: Commit** — `git commit -am "feat(sandbox): chamber — glide to a move and build the lesson in the night world"`

---

### Task 6: Fallbacks, mobile, polish, evidence

**Files:**
- Modify: `.claude/worktrees/ui-mindmap/index.html`

**Interfaces:** consumes everything above; produces the finished experience + updated memory note (outside repo).

- [ ] **Step 1: No-WebGL path.** In the Three effect, every early-`return` before RAF start must call `setGlOk(false)`. Cover when `!glOk`: render a static poster brain — one-shot 2D canvas draw using `sampleBrainSilhouette(900)` scaled to the canvas rect (points + no animation), on the same porcelain cover. `enterMind` with `!glOk`: `setBxScene("inside"); setListOpen(true);` — night DOM background + the list dialog is the whole move-choice UI (labels render but hide when no projector writes transforms: add `visibility: hidden` default on `.bw-label`, flipped to visible by the projection loop via `el.style.visibility = "visible"`). Chamber works as-is (DOM only).
  Verify by blocking Three: `navigate_page` with `initScript: "delete window.THREE"` — cover shows static brain, Enter → list on night bg, full tool flow works, zero console errors.
- [ ] **Step 2: Mobile pass (390×844 emulation).** Cover headline fits (no overflow); Enter ≥44px tall; inside: labels will overlap on small screens — add `@media (max-width: 720px)` rule hiding `.bw-label-q` and shrinking `.bw-label-name` to 16px; verify all 8 still tappable (spread OK because the fan is wide) — if two labels overlap >30%, widen the fan azimuth range for mobile (`-85..85°`) inside the cluster builder (`const FAN = mobile ? 85 : 75`). List button reachable; chamber panels stack single-column (existing auto-fit grid handles it); screenshots.
- [ ] **Step 3: Reduced-motion full pass.** Emulate `reduce`: cover static, Enter = instant night+inside, no drift/pulse/sway (assert two label transforms 1.5 s apart are identical), glide instant, chamber instant. Screenshots.
- [ ] **Step 4: Performance sanity.** Desktop: `performance_start_trace` during Enter flight + inside idle → no long-task pileup, steady frame rate (inspect trace summary; target 60 fps, accept ≥45). If under: halve line counts first, then point counts.
- [ ] **Step 5: Console + gates + final screenshots.** `list_console_messages` clean (two known exceptions). `npm run check:ui` + `npm test`. Screenshot set: cover / mid-transport / inside / list / mid-glide / chamber / mobile inside / reduced-motion inside.
- [ ] **Step 6: Commit** — `git commit -am "feat(sandbox): Brain World fallbacks, mobile + reduced-motion passes, polish"`
- [ ] **Step 7: Update memory** — edit `springboard-brain-experience-brief.md`: Brain World BUILT in sandbox (commits list), state = awaiting Nathan's reaction; keep the never-push rule line.

---

## Self-review notes (done at write time)

- Spec coverage: §1 beats → Tasks 2–5; §2 tech → Task 1 (with UMD amendment); §3 architecture → Tasks 2/4; §4 motion → Tasks 2–5 + reduced-motion in each; §5 a11y/fallbacks → Tasks 3–6; §6 removals → Task 2 Step 2; §7 verification → every task Step "Gates + browser verify"; §8 criteria → Task 4 money shot + Task 6 passes.
- Type consistency: `brainApi.current` members declared in Task 2 Interfaces and only extended (`enter`/`skipToInside` T3, `clusters` T4, `toChamber`/`toInside` T5). `bxScene` values: cover/transport/inside/glide/chamber — "glide" added in Task 5 (transient, renders nothing); harmless to earlier tasks since they never switch on it.
- Known judgement steps (not placeholders): visual tuning constants (sizes, opacities, fan angles) have starting values in code and explicit acceptance criteria (assertions, contrast ratios, screenshot checks).
