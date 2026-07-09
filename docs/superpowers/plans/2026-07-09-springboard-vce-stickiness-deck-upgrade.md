# Springboard — VCE guides, automatic stickiness, deck polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Springboard's stickiness automatic, load VCE study-design context automatically for Year 11/12, and lift the PowerPoint export to Digital Spotlight "Classic" quality.

**Architecture:** Single-file React+Babel client (`index.html`) posting to thin Vercel proxies (`api/*.js`). Curriculum knowledge is pre-condensed into small per-subject cards under `api/guides/`, injected server-side into the system prompt when the class is VCE Year 11/12. No build step; verification is Babel-compile + a Node backend check + a real `.pptx` open.

**Tech Stack:** React 18 (in-browser Babel classic preset), PptxGenJS 3.12, Vercel serverless (Node), OpenAI chat completions.

## Global Constraints

- No build step. Client is one `index.html`; JSX must compile under `@babel/standalone` classic React preset.
- Secrets stay server-side. `OPENAI_API_KEY` lives only in Vercel env; never in client or committed files. `.gitignore` already covers `.env*` and `.vercel`.
- pptxgenjs mutates option objects (shadow especially): every `addText/addImage/addShape/addMedia` call gets a FRESH object literal. Never share/reuse an options object.
- Fonts in the export stay **Arial** (portable; Graphik cannot embed).
- Backend file reads are allowlisted: only keys matching `^[a-z0-9-]+$` that exist in `api/guides/` are read. Never join raw input into a path.
- Study-guide cards are faithful paraphrase/extract of VCAA study designs — no invented outcomes, codes, or content.
- Springboard `main` is live; do NOT push or deploy without Nathan's explicit OK. Commit locally only.

---

## Part 1 — Automatic "Made to Stick"

### Task 1: Replace booster selection with always-on stickiness guidance

**Files:**
- Modify: `index.html` — `BOOSTERS` array (~855); `generateSpringboard` (~1183-1201); `analyseStimulus` (~1277-1338); component state/handlers (~1447, ~1465, ~1638, ~1653); generate/regenerate/log call sites (~1687, ~1701, ~1721); booster chips UI (~2210-2218).

**Interfaces:**
- Produces: `generateSpringboard({ passcode, mode, media, sourceText, classInfo, routineName, scope, current })` — `boosterIds` param REMOVED.
- Produces: `analyseStimulus(...)` returns `{ summary, routines }` — `boosters` REMOVED.

- [ ] **Step 1: Remove the `BOOSTERS` array, add a stickiness guidance constant.** Delete the whole `const BOOSTERS = [ ... ];` block (~line 855). In its place add:

```js
// Made to Stick (Chip & Dan Heath) — SUCCESs frame, applied as standing guidance to EVERY
// deck. No teacher toggle: stickiness is always on. Injected into the generate system prompt.
const STICKINESS_GUIDANCE = [
  "Make the ideas stick (Made to Stick / SUCCESs) — apply all of these automatically:",
  "- SIMPLE: one core idea per slide, said in plain words; cut everything that isn't the core.",
  "- UNEXPECTED: open the title/ignite with a curiosity gap or a surprise that breaks a pattern.",
  "- CONCRETE: use concrete, sensory, real-world language and examples, never abstract jargon.",
  "- CREDIBLE: include a vivid, checkable detail or telling statistic the class can trust.",
  "- EMOTIONAL: give students a reason to care — a person, stake or consequence, not a category.",
  "- STORY: shape the launch as a small narrative or scenario they can step into.",
].join("\n");
```

- [ ] **Step 2: Wire the guidance into `generateSpringboard`; drop `boosterIds`.** In the signature (~1183) remove `boosterIds = [],`. Delete the `boosterLines` line (~1185). In the `sys` template (~1195-1196) replace the two lines `Stickiness requirements:` / `${boosterLines || "- none"}` with a single line: `${STICKINESS_GUIDANCE}`.

- [ ] **Step 3: Strip boosters from `analyseStimulus`.** In the `sys` prompt (~1278-1280) remove the `"boosters": [...]` line and the phrase "+ boosters" from the two `userContent` texts (~1286, ~1293). Delete the booster parse block (~1334-1336) and change the return (~1338) to `return { summary: stripMd(parsed.summary || ""), routines: routines.slice(0, 3) };`.

- [ ] **Step 4: Remove booster state + handler.** Delete `const [boostersOn, setBoostersOn] = useState(() => new Set());` (~1465) and `function toggleBooster(id){...}` (~1653-1655). In `saveClassInfo` (~1447) remove `setBoostersOn(new Set());`. In `runAnalyse` (~1638) remove `setBoostersOn(new Set(result.boosters));`.

- [ ] **Step 5: Fix generate/regenerate/log call sites.** In `generate` (~1687) and `regenerate` (~1721) remove `boosterIds: [...boostersOn],` from the `generateSpringboard(...)` args. In both `logEvent(...)` calls (~1701, ~1721) remove the `boosters: [...boostersOn].join(",")` field.

- [ ] **Step 6: Remove the booster chips UI.** Delete the "Make it stick" heading + `advisory-chips` `BOOSTERS.map` block (~2210-2218). Change the Analyse hint (~2172) from "suggests a thinking routine + stickiness boosters" to "suggests a thinking routine".

- [ ] **Step 7: Verify JSX compiles and no `booster` references remain.**

```bash
cd "Apps/Springboard" && node -e "const b=require('./node_modules/@babel/standalone');const fs=require('fs');const m=fs.readFileSync('index.html','utf8').match(/<script type=\"text\/babel\">([\s\S]*?)<\/script>/);b.transform(m[1],{presets:['react']});console.log('babel OK')"
grep -in "booster" index.html || echo "no booster refs (good)"
```
Expected: `babel OK` and `no booster refs (good)`.

- [ ] **Step 8: Commit.** `git add index.html && git commit -m "feat: make Made-to-Stick automatic (remove booster picker)"`

---

## Part 2 — VCE study guides

### Task 2: Author the 50 condensed curriculum cards

**Files:**
- Create: `api/guides/<key>.md` x 50 (keys = the filename stems in the source manifest).
- Read (source, outside repo): `.../Ai Training Docs/VCE-Study-Designs/md/<key>.md` and `_manifest.md`.

**Interfaces:**
- Produces: 50 files named exactly by the manifest stems (`accounting.md` ... `visual-communication-design.md`). Consumed by Task 5's backend loader (filename = allowlist key).

- [ ] **Step 1: Create `api/guides/` and confirm the 50 source keys.** `mkdir -p api/guides`; `ls` the source md dir minus `_manifest`, strip `.md`. Expected: 50 keys.

- [ ] **Step 2: For each source study design, write one card** to `api/guides/<key>.md` using this exact template (fill from source Units -> Areas of Study -> Outcomes -> Key knowledge -> Key skills; drop copyright/ISBN/contact/assessment-weighting boilerplate). Target ~300-500 words. Faithful extract only.

```markdown
# <Subject> (VCE study design)

Scope: <one plain sentence on what this study is about>.

## Units 1-2 (Year 11)
- **Area of Study 1 — <title>:** <outcome in plain words>. Key knowledge: <themes>. Key skills: <skills>.
- (further areas of study as present)

## Units 3-4 (Year 12)
- **Area of Study 1 — <title>:** <outcome>. Key knowledge: <themes>. Key skills: <skills>.
- (further areas of study as present)

Cross-study skills: <short note on the study's signature skills/apparatus, if it shapes lessons>.
```

- [ ] **Step 3: Spot-check faithfulness.** Open 5 cards across learning areas (`biology`, `history`, `mathematical-methods`, `music`, `vce-vm-numeracy`) against source; confirm unit titles, area-of-study titles, outcomes match (paraphrase OK, no invention).

- [ ] **Step 4: Commit.** `git add api/guides/ && git commit -m "feat: add 50 condensed VCE curriculum cards"`

### Task 3: VCE subject dropdown (client)

**Files:**
- Modify: `index.html` — add `VCE_SUBJECTS` + helpers near `bandOf`/`CURRICULA` (~505-513); Subject field render (~2146-2150).

**Interfaces:**
- Produces: `VCE_SUBJECTS` = `{ key, name, area }[]` (50). `isVceSenior(ci)` -> boolean. `vceStudyGuide(ci)` -> `{ key, units } | null`.

- [ ] **Step 1: Add the subjects list + helpers** (after `bandOf`, ~505). `VCE_SUBJECTS` = 50 `{key,name,area}` entries. Keys = the 50 manifest stems, grouped by `area`: **The Arts** (dance, drama, music, theatre-studies, art-creative-practice, art-making-and-exhibiting, media, visual-communication-design); **English** (english-and-english-as-an-additional-language name "English and EAL", english-language, literature, foundation-english, bridging-english-as-an-additional-language name "Bridging EAL"); **Mathematics** (foundation-mathematics, general-mathematics, mathematical-methods, specialist-mathematics); **Science** (biology, chemistry, environmental-science, physics, psychology); **Humanities** (accounting, business-management, economics, industry-and-enterprise, legal-studies, classical-studies, geography, history, philosophy, politics, religion-and-society, sociology, texts-and-traditions); **Health & PE** (health-and-human-development, outdoor-and-environmental-studies, physical-education); **Technologies** (agricultural-and-horticultural-studies, food-studies, product-design-and-technologies, systems-engineering, algorithmics-hess name "Algorithmics (HESS)", applied-computing); **VCE VM** (vce-vm-literacy, vce-vm-numeracy, vce-vm-work-related-skills, vce-vm-personal-development-skills); **Cross-disciplinary** (extended-investigation, structured-workplace-learning-recognition-for-vet name "Structured Workplace Learning (VET)"). `name` = human display, and it is also what gets stored as `classInfo.subject`. Then add:

```js
const VCE_AREAS = [...new Set(VCE_SUBJECTS.map(s => s.area))];
// True when the class is VCE and Year 11 or 12 (picker + injection apply).
function isVceSenior(ci) {
  const n = parseInt(String(ci.yearLevel).replace(/\D/g, ""), 10);
  return ci.curriculum === "VCE" && (n === 11 || n === 12);
}
// Backend selector: null unless VCE Y11/12 with a recognised subject name.
function vceStudyGuide(ci) {
  if (!isVceSenior(ci)) return null;
  const hit = VCE_SUBJECTS.find(s => s.name === (ci.subject || "").trim());
  if (!hit) return null;
  const n = parseInt(String(ci.yearLevel).replace(/\D/g, ""), 10);
  return { key: hit.key, units: n === 11 ? "1-2" : "3-4" };
}
```

- [ ] **Step 2: Swap the Subject input for a grouped select when VCE Y11/12.** Replace the Subject `field-row` (~2146-2150) with:

```jsx
<div className="field-row">
  <label htmlFor="f-subj">Subject</label>
  {isVceSenior(classInfo)
    ? <select id="f-subj" value={classInfo.subject}
              onChange={e => saveClassInfo({ ...classInfo, subject: e.target.value })}>
        <option value="">Choose your VCE study…</option>
        {VCE_AREAS.map(area => (
          <optgroup label={area} key={area}>
            {VCE_SUBJECTS.filter(s => s.area === area).map(s => (
              <option key={s.key} value={s.name}>{s.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    : <input id="f-subj" type="text" placeholder="e.g. Science, English, Humanities"
             value={classInfo.subject} onChange={e => saveClassInfo({ ...classInfo, subject: e.target.value })} />}
</div>
```

- [ ] **Step 3: Verify compile + picker shows.** Babel check -> `babel OK`. In app: Curriculum=VCE, Year=11 -> Subject becomes grouped dropdown; Year=8 -> reverts to free text.

- [ ] **Step 4: Commit.** `git add index.html && git commit -m "feat: VCE Year 11/12 subject dropdown (grouped by learning area)"`

### Task 4: Send `studyGuide` with the generate request (client)

**Files:**
- Modify: `index.html` — `generateSpringboard` fetch body (~1245-1252) and `outcomeLine` prompt (~1186-1188).

**Interfaces:**
- Consumes: `vceStudyGuide(classInfo)` (Task 3).
- Produces: `/api/generate` body gains optional `studyGuide: { key, units }`.

- [ ] **Step 1: Add `studyGuide` to the request body.** Before the fetch (~1242) add `const studyGuide = vceStudyGuide(classInfo);`. In the JSON body add, after `max_completion_tokens: 4000,`: `...(studyGuide ? { studyGuide } : {}),`.

- [ ] **Step 2: Make the prompt use the guide when present.** Replace the `outcomeLine` block (~1186-1188) with:

```js
  const hasGuide = !!vceStudyGuide(classInfo);
  const outcomeLine = hasGuide
    ? `A VCE study-design extract for ${classInfo.subject} is provided below. ALIGN the launch slide's curriculum connection to THAT extract (its areas of study and outcomes)${classInfo.outcome.trim() ? `, narrowed to this outcome/topic: "${classInfo.outcome.trim()}"` : ""}. Quote real phrases from the extract; never invent codes.`
    : classInfo.outcome.trim()
      ? `ALIGN the launch slide to this exact outcome/topic, quoting its key phrases: "${classInfo.outcome.trim()}". Do not invent curriculum codes.`
      : `Write the curriculum connection in plain language for ${classInfo.curriculum} ${classInfo.subject}, year ${classInfo.yearLevel}. Never invent official curriculum codes or identifiers.`;
```

- [ ] **Step 3: Verify compile.** Babel check -> `babel OK`.

- [ ] **Step 4: Commit.** `git add index.html && git commit -m "feat: pass VCE studyGuide selector to the generate backend"`

### Task 5: Inject the guide server-side

**Files:**
- Modify: `api/generate.js`.
- Create: `vercel.json` (only if the bundler prunes `api/guides`).
- Test: `api/_generate.test.mjs` (Node, no framework).

**Interfaces:**
- Consumes: request body `studyGuide: { key, units }` (Task 4) + files `api/guides/<key>.md` (Task 2).
- Produces: exported `injectStudyGuide(messages, studyGuide)` -> new messages with the extract appended to the last system message.

- [ ] **Step 1: Write the failing test** `api/_generate.test.mjs`:

```js
import assert from "node:assert";
import { injectStudyGuide } from "./generate.js";
const base = [{ role: "system", content: "SYS" }, { role: "user", content: "U" }];
assert.deepStrictEqual(injectStudyGuide(base, { key: "nope", units: "1-2" }), base);      // unknown -> unchanged
assert.deepStrictEqual(injectStudyGuide(base, { key: "../_lib", units: "1-2" }), base);   // traversal -> unchanged
const out = injectStudyGuide(base, { key: "biology", units: "1-2" });
assert.ok(out[0].content.includes("SYS"));
assert.ok(/Units 1[–-]2/.test(out[0].content));
console.log("injectStudyGuide OK");
```

- [ ] **Step 2: Run it, expect failure.** `cd "Apps/Springboard" && node api/_generate.test.mjs` -> FAIL (not exported yet).

- [ ] **Step 3: Implement `injectStudyGuide` + call it.** At the top of `api/generate.js` add:

```js
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const GUIDES_DIR = join(dirname(fileURLToPath(import.meta.url)), "guides");
// Append a VCE study-design extract to the last system message. Allowlist + regex guard the
// filename so raw input can never traverse the path. Unknown/missing -> messages unchanged.
export function injectStudyGuide(messages, studyGuide) {
  if (!studyGuide || typeof studyGuide.key !== "string") return messages;
  const key = studyGuide.key;
  if (!/^[a-z0-9-]+$/.test(key)) return messages;
  const file = join(GUIDES_DIR, key + ".md");
  if (!file.startsWith(GUIDES_DIR) || !existsSync(file)) return messages;
  let text = readFileSync(file, "utf8");
  const units = studyGuide.units === "3-4" ? "3-4" : "1-2";
  const wanted = units === "1-2" ? /## Units 1[–-]2/ : /## Units 3[–-]4/;
  const other  = units === "1-2" ? /## Units 3[–-]4/ : /## Units 1[–-]2/;
  const start = text.search(wanted);
  if (start >= 0) {
    const rest = text.slice(start + 1);
    const end = rest.search(other);
    const head = text.slice(0, text.indexOf("\n"));
    text = head + "\n" + (end >= 0 ? text.slice(start, start + 1 + end) : text.slice(start));
  }
  const out = messages.slice();
  const i = out.map(m => m.role).lastIndexOf("system");
  const idx = i >= 0 ? i : 0;
  out[idx] = { ...out[idx], content: out[idx].content + "\n\n--- VCE STUDY-DESIGN EXTRACT ---\n" + text };
  return out;
}
```
Then in `handler`: destructure `studyGuide` from `req.body` (~8) and change `payload` messages (~13) to `messages: injectStudyGuide(messages, studyGuide)`.

- [ ] **Step 4: Run the test, expect pass.** `node api/_generate.test.mjs` -> `injectStudyGuide OK`.

- [ ] **Step 5: Ensure Vercel bundles the guides.** If `vercel dev`/deploy can't find `api/guides/*.md`, create `vercel.json`: `{ "functions": { "api/generate.js": { "includeFiles": "api/guides/**" } } }`.

- [ ] **Step 6: Commit.** `git add api/generate.js api/_generate.test.mjs vercel.json && git commit -m "feat: inject VCE study-design extract server-side (allowlisted)"`

---

## Part 3 — Deck polish (one look)

### Task 6: Lift `buildDeckBlob` to Digital Spotlight "Classic" craft

**Files:**
- Modify: `index.html` — `buildDeckBlob` (~1768-1990): helpers (~1801-1839), IGNITE/THINK/LAUNCH/REFLECT (~1904-1976).
- Reference (read-only): `Apps/Tech Spotlight Generator/index.html` `buildDeckBlob` Classic path (~2100-2170) for type scale, eyebrows, gold rules, title-casing.

**Interfaces:**
- Consumes: existing `deck`, `classInfo`, `WESLEY`, `drawStimulus`, `newWhite`, `goldCrest`, `wordmark`, `pageNo`, `kicker`, `cap`.
- Produces: same `buildDeckBlob(bandKey, deck)` signature + return. No API change.

- [ ] **Step 1: Add `tCase` + `eyebrow` helpers** inside `buildDeckBlob` (~1805):

```js
      const tCase = (t) => String(t || "").replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      const eyebrow = (s, txt, x, y, color) => s.addText(String(txt || "").toUpperCase(),
        { x, y, w: W - 2 * x, h: 0.3, fontSize: 11, bold: true, color: color || GOLD_LT, charSpacing: 3, fontFace: FONT });
```

- [ ] **Step 2: Rebuild the IGNITE cover** (~1904-1925). Replace the block body with:

```js
        sNum++;
        const s = pptx.addSlide();
        s.background = { color: P };
        goldCrest(s, 1.55);
        eyebrow(s, "SPRINGBOARD", 0.7, 0.55, GOLD_LT);
        s.addText(tCase(title), { x: 0.7, y: 0.95, w: W - 2.5, h: 1.4, fontSize: 44, bold: true, color: WHITE, valign: "top", fontFace: FONT, charSpacing: -0.5, fit: "shrink" });
        if (metaLine) s.addText(metaLine, { x: 0.7, y: 2.42, w: W - 1.4, h: 0.32, fontSize: 12.5, color: SUB, charSpacing: 0.5, fontFace: FONT });
        const drew = await drawStimulus(s, 0.7, 2.95, W - 1.4, 2.45);
        s.addShape(pptx.ShapeType.rect, { x: 0.7, y: drew ? 5.55 : 3.0, w: 2.4, h: 0.05, fill: { color: GOLD } });
        s.addText(igniteQ, drew
          ? { x: 0.7, y: 5.72, w: W - 1.4, h: 1.15, fontSize: 25, bold: true, color: GOLD, valign: "top", fontFace: FONT, fit: "shrink" }
          : { x: 0.7, y: 3.2, w: W - 1.4, h: 2.2, fontSize: 42, bold: true, color: GOLD, valign: "middle", fontFace: FONT, fit: "shrink" });
        pageNo(s, true);
        s.addNotes(noteFor("ignite"));
```

- [ ] **Step 3: Strengthen white-slide type scale.** THINK routine title (~1931) -> `fontSize: 32`; LAUNCH "Into today's lesson" (~1950) -> `26`; REFLECT "Revisit your thinking" (~1964) -> `26`; launch question (~1956) -> `28`; reflect step text (~1972) -> `19`. Keep every option object fresh (no reuse — pptxgenjs mutates them).

- [ ] **Step 4: Verify compile.** Babel check -> `babel OK`.

- [ ] **Step 5: Export + open a real deck.** Generate a deck, Download, open the `.pptx` in desktop PowerPoint: opens with no repair prompt, cover reads as a confident Wesley title slide, sections consistent, nothing clipped. If a Node PowerPoint COM oracle exists (project memory), run it to confirm openability headlessly.

- [ ] **Step 6: Commit.** `git add index.html && git commit -m "feat: lift Springboard deck to Digital Spotlight Classic craft"`

---

## Final verification (whole feature)

- [ ] Babel compile clean; `grep -in booster index.html` returns nothing.
- [ ] `node api/_generate.test.mjs` passes (known key injects, unknown/traversal no-op).
- [ ] Live: VCE + Year 11 + Biology -> generate -> Launch connection reflects Biology Units 1-2 areas of study; non-VCE (IB MYP + Science + Year 8) -> generate still works, no dropdown, no guide.
- [ ] A downloaded `.pptx` opens cleanly in PowerPoint and looks on par with a Digital Spotlight Classic deck.
- [ ] Nothing pushed/deployed without Nathan's OK.
