# Curriculum Focus Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the brain experience, make Subject a year-driven picker (VCE studies for Year 11/12, ACARA subjects for Foundation–Year 10) and let teachers tick the specific learning intentions / content descriptions, which then focus generation and land in the teacher-only LAUNCH notes.

**Architecture:** A new read-only endpoint `api/guide.js` parses one subject's curriculum section into tickable items and returns them as JSON. Shared guide-reading/slicing/parsing moves into `api/_guides.js` so `generate.js` and `guide.js` use one copy. The frontend (single-file React in `index.html`) swaps the brain "Your class" free-text Subject box for a year-driven `<select>`, fetches the items on selection, renders grouped checkboxes into a collapsible panel, sends the ticked strings inside the existing `studyGuide` payload, and writes them into the LAUNCH speaker notes.

**Tech Stack:** Node ESM serverless functions (Vercel), `node --test` unit tests with `test/_helpers.js` mock req/res, in-browser Babel React (no build step), PptxGenJS export.

## Global Constraints

- Both gates must pass before every commit: `npm test` AND `npm run check:ui`. Copy verbatim.
- Work commits straight to `main`; a push auto-deploys Pages + Vercel.
- Bump `APP_VERSION` in `index.html` on the user-visible deploy (currently `const APP_VERSION = "v0.9.17 · 2026-07-24";`).
- The repo is public: never commit secrets. Curriculum text is public and fine to serve.
- Every new endpoint follows the gate sequence: `applyCors` → `requireTeacher` → `rateLimit`.
- Filename guard for any guide read: `^[a-z0-9-]+$` on the key PLUS a `startsWith(GUIDES_DIR)` path-prefix check PLUS `existsSync`. Unknown/unmatched input returns empty, never an error the UI must special-case.
- Class settings (incl. the new `focus`) must NOT persist across refreshes.
- Curriculum text stays teacher-only — it rides in LAUNCH speaker notes, never a projected slide.
- Do NOT touch the Classic view (`icol` builder) or add an `OPENAI_MODEL` env var.
- Reduced-motion alternative for any animation; Wesley palette; WCAG 2.2 AA.

## File Structure

- **Create `api/_guides.js`** — shared guide module: `GUIDES_DIR`, `readGuide(key)`, `sliceAcLevel(text, yearLevel)` (moved from generate.js), `sliceVceUnits(text, units)` (extracted from `injectStudyGuide`), `parseItems(sectionText, kind)` (new).
- **Modify `api/generate.js`** — import slicers from `_guides.js`; `injectStudyGuide` reuses them and gains `focus` support. Keep `injectStudyGuide` and `sliceAcLevel` exported (existing tests import them).
- **Create `api/guide.js`** — new endpoint returning `{ subject, groups }` for one subject+year.
- **Modify `vercel.json`** — ship `api/guides/**` with `guide.js` too.
- **Modify `index.html`** — brain "Your class" step (year-driven Subject + Other escape + curriculum derivation), curriculum-focus panel (fetch + checkboxes), send `focus`, write focus into LAUNCH notes, `loadClassInfo` gains `focus: []`, version bump, small CSS.
- **Create `test/guides.test.js`** — unit tests for `parseItems`, `sliceVceUnits`, `readGuide`, and the `api/guide.js` handler.
- **Modify `test/lib.test.js`** (or wherever `injectStudyGuide` is tested) — add focus-block test.

---

### Task 1: Extract shared guide module (refactor, no behaviour change)

**Files:**
- Create: `api/_guides.js`
- Modify: `api/generate.js` (imports + `injectStudyGuide` internals)
- Test: existing `test/*.test.js` must stay green (safety net)

**Interfaces:**
- Produces: `readGuide(key: string) => string|null`, `sliceAcLevel(text, yearLevel) => string|null`, `sliceVceUnits(text, units) => string|null` (all from `api/_guides.js`). `generate.js` keeps re-exporting `sliceAcLevel` and `injectStudyGuide`.

- [ ] **Step 1: Baseline — run the existing tests green first**

Run: `npm test`
Expected: PASS (record the count; it must not drop after this task).

- [ ] **Step 2: Create `api/_guides.js`**

```javascript
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const GUIDES_DIR = join(dirname(fileURLToPath(import.meta.url)), "guides");

// Read a guide by key with the same guard injectStudyGuide uses: allowlist regex,
// path-prefix pin, existence. Returns file text or null (never throws on bad input).
export function readGuide(key) {
  if (typeof key !== "string" || !/^[a-z0-9-]+$/.test(key)) return null;
  const file = join(GUIDES_DIR, key + ".md");
  if (!file.startsWith(GUIDES_DIR) || !existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

// Pick the "## <heading>" section of an ac-*.md guide matching a year level ("Prep","4","Year 10").
// Returns (file head + one section), or null if no section matches / year out of range.
export function sliceAcLevel(text, yearLevel) {
  const s = String(yearLevel || "");
  const n = /prep|foundation|^\s*[fk]\s*$/i.test(s) ? 0 : parseInt(s.replace(/\D/g, ""), 10);
  if (Number.isNaN(n) || n > 10) return null;
  const sections = [...text.matchAll(/^## +(.+)$/gm)];
  const hit = sections.find(({ 1: h }) => {
    if (/foundation/i.test(h)) return n === 0;
    const years = (h.match(/\d+/g) || []).map(Number);
    return years.includes(n) || (years.length === 2 && n >= years[0] && n <= years[1]);
  });
  if (!hit) return null;
  const start = hit.index;
  const next = sections.find(sec => sec.index > start);
  const head = text.slice(0, text.indexOf("\n## "));
  return head + "\n" + text.slice(start, next ? next.index : undefined);
}

// Pick the "## Units 1-2" or "## Units 3-4" block of a VCE study guide (no head prepended).
// Returns the raw section slice, or null if the wanted block is absent.
export function sliceVceUnits(text, units) {
  const u = units === "3-4" ? "3-4" : "1-2";
  const wanted = u === "1-2" ? /## Units 1[–-]2/ : /## Units 3[–-]4/;
  const other  = u === "1-2" ? /## Units 3[–-]4/ : /## Units 1[–-]2/;
  const start = text.search(wanted);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const end = rest.search(other);
  return end >= 0 ? text.slice(start, start + 1 + end) : text.slice(start);
}
```

- [ ] **Step 3: Rewire `api/generate.js` to use the shared module**

At the top of `api/generate.js`, replace the fs/path imports and the local `GUIDES_DIR` + `sliceAcLevel` definition with an import, and re-export `sliceAcLevel` for existing tests:

```javascript
import { applyCors, requireTeacher, rateLimit } from "./_lib.js";
import { GUIDES_DIR, readGuide, sliceAcLevel, sliceVceUnits } from "./_guides.js";

export { sliceAcLevel }; // keep the existing test import path working
```

Delete the old `import { readFileSync, existsSync } ...`, the `import { join, dirname } ...`, the `import { fileURLToPath } ...`, the `const GUIDES_DIR = ...`, and the whole local `export function sliceAcLevel(...) { ... }` block.

Then replace the body of `injectStudyGuide` so it uses `readGuide` / `sliceVceUnits` (behaviour identical to today):

```javascript
export function injectStudyGuide(messages, studyGuide) {
  if (!studyGuide || typeof studyGuide.key !== "string") return messages;
  const key = studyGuide.key;
  const raw = readGuide(key);
  if (!raw) return messages;
  let text = raw;
  let banner = "--- VCE STUDY-DESIGN EXTRACT ---";
  if (key.startsWith("ac-")) {
    const sliced = sliceAcLevel(text, studyGuide.level);
    if (!sliced) return messages;
    text = sliced;
    banner = "--- AUSTRALIAN CURRICULUM v9 EXTRACT ---";
  } else {
    const section = sliceVceUnits(text, studyGuide.units);
    if (section) {
      const head = text.slice(0, text.indexOf("\n"));
      text = head + "\n" + section;
    }
  }
  const out = messages.slice();
  const i = out.map(m => m.role).lastIndexOf("system");
  const idx = i >= 0 ? i : 0;
  out[idx] = { ...out[idx], content: out[idx].content + "\n\n" + banner + "\n" + text };
  return out;
}
```

- [ ] **Step 4: Run tests to verify the refactor kept behaviour**

Run: `npm test`
Expected: PASS with the same count as Step 1 (no regressions).

- [ ] **Step 5: Commit**

```bash
git add api/_guides.js api/generate.js
git commit -m "refactor(api): extract shared guide reader/slicers into _guides.js"
```

---

### Task 2: `parseItems` — turn a curriculum section into tickable items (TDD)

**Files:**
- Modify: `api/_guides.js` (add `parseItems`)
- Test: `test/guides.test.js` (create)

**Interfaces:**
- Produces: `parseItems(sectionText: string, kind: "ac"|"vce") => Array<{ heading: string, items: Array<{ id: string, text: string }> }>`. For `ac`, `id` = the ACARA code and `text` = `"CODE — description"`. For `vce`, `id` = a slug of the AoS title and `text` = the AoS title. Groups with no items are dropped.

- [ ] **Step 1: Write the failing test**

Create `test/guides.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseItems, sliceVceUnits, readGuide } from "../api/_guides.js";

const AC_SECTION = `# Australian Curriculum v9: Science (F–10)
## Year 7

**Achievement standard:** By the end of Year 7 students explain ...

### Science understanding

#### Biological sciences

- **AC9S7U01:** investigate the role of classification in ordering and organising diversity
- **AC9S7U02:** use models, including food webs, to represent matter and energy flow

#### Chemical sciences

- **AC9S7U05:** use particle theory to describe the arrangement of particles
`;

test("parseItems(ac) groups by sub-strand and keeps codes in the text", () => {
  const groups = parseItems(AC_SECTION, "ac");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].heading, "Biological sciences");
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].id, "AC9S7U01");
  assert.equal(
    groups[0].items[0].text,
    "AC9S7U01 — investigate the role of classification in ordering and organising diversity"
  );
  assert.equal(groups[1].heading, "Chemical sciences");
  assert.equal(groups[1].items[0].id, "AC9S7U05");
});

const VCE_SECTION = `## Units 1-2 (Year 11)
- **Unit 1, AoS1 — How do cells function?:** explain cellular structure. Key knowledge: organelles.
- **Unit 1, AoS2 — How do plant and animal systems function?:** explain specialisation.
- **Unit 1, AoS3 — scientific investigation:** students design and conduct an investigation.
`;

test("parseItems(vce) makes one group of AoS titles, no key-knowledge detail", () => {
  const groups = parseItems(VCE_SECTION, "vce");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].heading, "");
  assert.equal(groups[0].items.length, 3);
  assert.equal(groups[0].items[0].text, "Unit 1, AoS1 — How do cells function?");
  assert.equal(groups[0].items[0].id, "unit-1-aos1-how-do-cells-function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/guides.test.js`
Expected: FAIL with "parseItems is not a function" (or similar export error).

- [ ] **Step 3: Add `parseItems` to `api/_guides.js`**

```javascript
// Turn a sliced curriculum section into tickable items.
//  - `#### heading` (or `###`) opens a group.
//  - `- **LEAD:** rest` is one item; LEAD is the text inside the first bold run.
//  - non-bold bullets (e.g. VCE assessment lines) and prose are ignored.
// kind "ac": id = LEAD (the code), text = "LEAD — rest".
// kind "vce": id = slug(LEAD title), text = LEAD (the AoS title; rest/key-knowledge dropped).
export function parseItems(sectionText, kind) {
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const groups = [];
  let current = null;
  const ensure = () => (current || (current = { heading: "", items: [] }, groups.push(current), current));
  for (const line of String(sectionText).split("\n")) {
    const h = line.match(/^#{3,4}\s+(.+?)\s*$/);
    if (h) { current = { heading: h[1], items: [] }; groups.push(current); continue; }
    const b = line.match(/^-\s+\*\*(.+?):\*\*\s*(.*)$/);
    if (!b) continue;
    const lead = b[1].trim();
    const rest = b[2].trim();
    if (kind === "ac") ensure().items.push({ id: lead, text: rest ? `${lead} — ${rest}` : lead });
    else ensure().items.push({ id: slug(lead), text: lead });
  }
  return groups.filter(g => g.items.length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/guides.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Add a real-file smoke test and run the full suite**

Append to `test/guides.test.js`:

```javascript
test("sliceVceUnits + parseItems on the real biology guide yields AoS items", () => {
  const text = readGuide("biology");
  assert.ok(text, "biology.md should be readable");
  const groups = parseItems(sliceVceUnits(text, "1-2"), "vce");
  const titles = groups.flatMap(g => g.items.map(i => i.text));
  assert.ok(titles.some(t => t.startsWith("Unit 1, AoS1")), "expected a Unit 1 AoS1 item");
  assert.ok(!titles.some(t => /Assessed through/.test(t)), "assessment prose must not become an item");
});
```

Run: `npm test`
Expected: PASS (Task 1 count + the 3 new tests).

- [ ] **Step 6: Commit**

```bash
git add api/_guides.js test/guides.test.js
git commit -m "feat(api): parseItems turns a curriculum section into tickable items"
```

---

### Task 3: `api/guide.js` endpoint (TDD)

**Files:**
- Create: `api/guide.js`
- Modify: `vercel.json`
- Test: `test/guides.test.js` (add handler tests)

**Interfaces:**
- Consumes: `readGuide`, `sliceAcLevel`, `sliceVceUnits`, `parseItems` from `_guides.js`; `applyCors`, `requireTeacher`, `rateLimit` from `_lib.js`; `mockReqRes` from `test/_helpers.js`.
- Produces: `POST /api/guide` with body `{ key, level }` (ACARA) or `{ key, units }` (VCE) → `200 { subject: string, groups: [...] }`. Bad/unknown key → `200 { subject: "", groups: [] }`.

- [ ] **Step 1: Write the failing test**

Append to `test/guides.test.js`:

```javascript
import { mockReqRes } from "./_helpers.js";
import guideHandler from "../api/guide.js";

test("guide endpoint returns grouped items for a real ACARA subject+level", async () => {
  const { req, res } = mockReqRes({ body: { key: "ac-science", level: "7" } });
  await guideHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.subject.length > 0);
  assert.ok(res.body.groups.length > 0);
  assert.ok(res.body.groups[0].items[0].id.startsWith("AC9"));
});

test("guide endpoint returns empty for an unknown key (no error path)", async () => {
  const { req, res } = mockReqRes({ body: { key: "../secrets", level: "7" } });
  await guideHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { subject: "", groups: [] });
});

test("guide endpoint rejects non-POST", async () => {
  const { req, res } = mockReqRes({ method: "GET" });
  await guideHandler(req, res);
  assert.equal(res.statusCode, 405);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/guides.test.js`
Expected: FAIL — cannot find module `../api/guide.js`.

- [ ] **Step 3: Create `api/guide.js`**

```javascript
import { applyCors, requireTeacher, rateLimit } from "./_lib.js";
import { readGuide, sliceAcLevel, sliceVceUnits, parseItems } from "./_guides.js";

// Read-only: hands the client the tickable curriculum items for one subject+year so the
// teacher can pick the specific learning intentions / content descriptions a lesson targets.
// Same security guard as injectStudyGuide (in readGuide). Unknown input -> empty, never an error.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;
  if (!rateLimit(req, res, { max: 30, windowMs: 60000, name: "guide" })) return;

  const { key, level, units } = req.body || {};
  const text = readGuide(key);
  if (!text) return res.status(200).json({ subject: "", groups: [] });

  const subject = (text.match(/^#\s+(.+)$/m)?.[1] || "").trim();
  const isAc = String(key).startsWith("ac-");
  const section = isAc ? sliceAcLevel(text, level) : sliceVceUnits(text, units);
  if (!section) return res.status(200).json({ subject, groups: [] });

  return res.status(200).json({ subject, groups: parseItems(section, isAc ? "ac" : "vce") });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/guides.test.js`
Expected: PASS (all guides tests).

- [ ] **Step 5: Ship guides with the new function**

Edit `vercel.json` line 2 so both functions include the guides:

```json
  "functions": {
    "api/generate.js": { "includeFiles": "api/guides/**" },
    "api/guide.js": { "includeFiles": "api/guides/**" }
  },
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/guide.js vercel.json test/guides.test.js
git commit -m "feat(api): add read-only /api/guide endpoint for tickable curriculum items"
```

---

### Task 4: `injectStudyGuide` focus support (TDD)

**Files:**
- Modify: `api/generate.js` (`injectStudyGuide`)
- Test: `test/guides.test.js` (add focus tests)

**Interfaces:**
- Consumes: `injectStudyGuide` from `../api/generate.js`.
- Produces: when `studyGuide.focus` is a non-empty array AND a guide matched, the injected extract is followed by a `--- TEACHER'S CURRICULUM FOCUS ---` block listing the ticked strings. With no `focus`, output is byte-identical to today.

- [ ] **Step 1: Write the failing test**

Append to `test/guides.test.js`:

```javascript
import { injectStudyGuide } from "../api/generate.js";

const baseMsgs = () => [{ role: "system", content: "SYS" }, { role: "user", content: "U" }];

test("injectStudyGuide appends a focus block when focus is present", () => {
  const out = injectStudyGuide(baseMsgs(), { key: "ac-science", level: "7", focus: ["AC9S7U01 — investigate classification"] });
  const sys = out[0].content;
  assert.match(sys, /AUSTRALIAN CURRICULUM v9 EXTRACT/);
  assert.match(sys, /TEACHER'S CURRICULUM FOCUS/);
  assert.match(sys, /- AC9S7U01 — investigate classification/);
});

test("injectStudyGuide with no focus is unchanged from the plain extract", () => {
  const withEmpty = injectStudyGuide(baseMsgs(), { key: "ac-science", level: "7", focus: [] });
  const without = injectStudyGuide(baseMsgs(), { key: "ac-science", level: "7" });
  assert.equal(withEmpty[0].content, without[0].content);
  assert.doesNotMatch(without[0].content, /TEACHER'S CURRICULUM FOCUS/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/guides.test.js`
Expected: FAIL — "TEACHER'S CURRICULUM FOCUS" not found.

- [ ] **Step 3: Add the focus block to `injectStudyGuide`**

In `api/generate.js`, replace the final assembly of `injectStudyGuide` (the `const out = messages.slice(); ... return out;` tail written in Task 1 Step 3) with:

```javascript
  const out = messages.slice();
  const i = out.map(m => m.role).lastIndexOf("system");
  const idx = i >= 0 ? i : 0;
  let block = banner + "\n" + text;
  if (Array.isArray(studyGuide.focus) && studyGuide.focus.length) {
    block += "\n\n--- TEACHER'S CURRICULUM FOCUS ---\n"
      + "Centre this lesson on these specific points; treat the rest of the extract as background only:\n"
      + studyGuide.focus.map(f => "- " + String(f)).join("\n");
  }
  out[idx] = { ...out[idx], content: out[idx].content + "\n\n" + block };
  return out;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/guides.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: PASS.

```bash
git add api/generate.js test/guides.test.js
git commit -m "feat(api): injectStudyGuide focuses the lesson on ticked curriculum points"
```

---

### Task 5: Brain "Your class" — year-driven Subject picker (frontend)

**Files:**
- Modify: `index.html` (brain "Your class" panel; `loadClassInfo`; builder state; a small handler)

**Interfaces:**
- Consumes: existing `VCE_SUBJECTS`, `VCE_AREAS`, `AC_SUBJECTS`, `AC_AREAS`, `acSubjectsFor`, `acYearNum`, `isVceSenior`, `isAcF10`, `saveClassInfo`, `classInfo`.
- Produces: `classInfo.curriculum` is auto-derived from Year (11/12 → `"VCE"`, F–10 → `"Australian Curriculum"`, blank → `"IB MYP"`); `classInfo.subject` is a listed subject name or free text; `subjectFreeform` state; `classInfo.focus` reset on any Year/Subject change. Frontend tasks have no unit test — the gate is `npm run check:ui` plus a described manual check.

- [ ] **Step 1: Give `classInfo` a `focus` field**

Find `function loadClassInfo()` and change its return to include `focus: []`:

```javascript
  return { curriculum: "IB MYP", subject: "", yearLevel: "", outcome: "", focus: [] };
```

- [ ] **Step 2: Add builder state**

Next to the other builder `useState` calls (near `const [mode, setMode] = useState("media");`), add:

```javascript
  const [subjectFreeform, setSubjectFreeform] = useState(false); // brain Subject "Other / not listed"
  const [focusGroups, setFocusGroups] = useState([]);            // fetched curriculum items
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusError, setFocusError] = useState("");
```

- [ ] **Step 3: Add the subject-pick handler**

Immediately before the brain builder's returned JSX (near `const onPickBrainMove = ...` / the `generate` function), add:

```javascript
  // Brain Subject <select>: "__other__" reverts to a free-text box; any real pick clears focus.
  const onPickBrainSubject = (e) => {
    const v = e.target.value;
    if (v === "__other__") { setSubjectFreeform(true); saveClassInfo({ ...classInfo, subject: "", focus: [] }); setFocusGroups([]); setFocusError(""); return; }
    setSubjectFreeform(false); saveClassInfo({ ...classInfo, subject: v, focus: [] });
  };
```

- [ ] **Step 4: Replace the brain Subject field and make Year derive the curriculum**

In the brain "Your class" panel, replace the `bx-two` block (the Subject `<input>` + Year `<select>`) with:

```jsx
          <div className="bx-two">
            <div className="bx-field"><label>Year</label>
              <select value={classInfo.yearLevel} onChange={e => {
                const y = e.target.value;
                const m = acYearNum(y);
                const curriculum = (m === 11 || m === 12) ? "VCE"
                  : (!Number.isNaN(m) && m <= 10) ? "Australian Curriculum" : "IB MYP";
                setSubjectFreeform(false); setFocusGroups([]); setFocusError("");
                saveClassInfo({ ...classInfo, yearLevel: y, curriculum, subject: "", focus: [] });
              }}>
                <option value="">—</option>{["F","1","2","3","4","5","6","7","8","9","10","11","12"].map(y => <option key={y} value={y}>{y === "F" ? "Foundation" : "Year " + y}</option>)}
              </select></div>
            <div className="bx-field"><label>Subject</label>
              {!classInfo.yearLevel
                ? <select className="bx-input" disabled><option>Pick a year first</option></select>
                : subjectFreeform
                ? <input className="bx-input" value={classInfo.subject} placeholder="Type your subject"
                         onChange={e => saveClassInfo({ ...classInfo, subject: e.target.value })} />
                : isVceSenior(classInfo)
                ? <select className="bx-input" value={classInfo.subject} onChange={onPickBrainSubject}>
                    <option value="">Choose your VCE study…</option>
                    {VCE_AREAS.map(area => (
                      <optgroup label={area} key={area}>
                        {VCE_SUBJECTS.filter(s => s.area === area).map(s => <option key={s.key} value={s.name}>{s.name}</option>)}
                      </optgroup>
                    ))}
                    <option value="__other__">Other / not listed…</option>
                  </select>
                : isAcF10(classInfo)
                ? <select className="bx-input" value={classInfo.subject} onChange={onPickBrainSubject}>
                    <option value="">Choose your subject…</option>
                    {AC_AREAS.map(area => {
                      const subs = acSubjectsFor(classInfo.yearLevel).filter(s => s.area === area);
                      return subs.length ? (
                        <optgroup label={area} key={area}>
                          {subs.map(s => <option key={s.key} value={s.name}>{s.name}</option>)}
                        </optgroup>
                      ) : null;
                    })}
                    <option value="__other__">Other / not listed…</option>
                  </select>
                : <input className="bx-input" value={classInfo.subject} placeholder="e.g. English"
                         onChange={e => saveClassInfo({ ...classInfo, subject: e.target.value })} />}
            </div>
          </div>
```

- [ ] **Step 5: Compile gate**

Run: `npm run check:ui`
Expected: PASS ("check:ui" compiles the inline JSX with no syntax errors).

- [ ] **Step 6: Manual check**

Run: `npx vercel dev` (serves index.html + api). In the browser: enter a move → in "Your class", pick **Year 11** → Subject becomes "Choose your VCE study…" with grouped studies + "Other / not listed…". Pick **Year 7** → Subject becomes ACARA subjects for Year 7. Choose **Other / not listed…** → a text box appears. Change Year → Subject resets. Confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(ui): year-driven Subject picker in the brain Your class step"
```

---

### Task 6: Curriculum-focus panel — fetch + checkboxes (frontend)

**Files:**
- Modify: `index.html` (fetch effect; focus panel JSX; small CSS)

**Interfaces:**
- Consumes: `focusGroups`/`focusLoading`/`focusError` state (Task 5), `vceStudyGuide`, `acStudyGuide`, `API_BASE`, `passcode`, `saveClassInfo`, `classInfo.focus`.
- Produces: on subject/year change, `POST /api/guide` fills `focusGroups`; ticking a checkbox toggles that item's `text` in `classInfo.focus`.

- [ ] **Step 1: Add the fetch effect**

Near the other builder `useEffect`s (search for an existing `useEffect(` in the component to place it alongside), add:

```javascript
  // Fetch the tickable curriculum items whenever a recognised VCE/AC subject is chosen.
  useEffect(() => {
    const guide = vceStudyGuide(classInfo) || acStudyGuide(classInfo);
    if (!guide) { setFocusGroups([]); return; }
    let cancelled = false;
    (async () => {
      setFocusLoading(true); setFocusError("");
      try {
        const r = await fetch(API_BASE + "/api/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sb-passcode": passcode.trim() },
          body: JSON.stringify(guide),
        });
        if (!r.ok) throw new Error("lookup failed");
        const data = await r.json();
        if (!cancelled) setFocusGroups(Array.isArray(data.groups) ? data.groups : []);
      } catch (_) {
        if (!cancelled) { setFocusGroups([]); setFocusError("Couldn't load the curriculum list — you can still make the lesson."); }
      } finally {
        if (!cancelled) setFocusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classInfo.subject, classInfo.yearLevel]);
```

- [ ] **Step 2: Add the focus panel JSX**

In the brain "Your class" panel, immediately AFTER the `bx-two` block from Task 5 and BEFORE the "Learning focus (optional)" field, add:

```jsx
          {(focusLoading || focusError || focusGroups.length > 0) && (
            <details className="bx-focus" open>
              <summary>Curriculum focus (optional)</summary>
              {focusLoading && <p className="bx-note">Loading the curriculum list…</p>}
              {focusError && <p className="bx-note">{focusError}</p>}
              {!focusLoading && !focusError && focusGroups.length > 0 && (
                <React.Fragment>
                  <p className="bx-note">Tick the ones this lesson targets, or leave blank to cover the whole subject.</p>
                  {focusGroups.map(g => (
                    <div className="bx-focus-group" key={g.heading || "grp"}>
                      {g.heading && <div className="bx-focus-heading">{g.heading}</div>}
                      {g.items.map(it => {
                        const on = (classInfo.focus || []).includes(it.text);
                        return (
                          <label className="bx-focus-item" key={it.id}>
                            <input type="checkbox" checked={on} onChange={() => {
                              const cur = classInfo.focus || [];
                              const next = on ? cur.filter(x => x !== it.text) : [...cur, it.text];
                              saveClassInfo({ ...classInfo, focus: next });
                            }} />
                            <span>{it.text}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </React.Fragment>
              )}
            </details>
          )}
```

- [ ] **Step 3: Add minimal CSS**

In the `.ww-chamber` / `.bx-*` CSS area, add (paper theme, no animation, reduced-motion safe by default):

```css
  .bx-focus { border-top: 1px solid rgba(43,40,31,.18); margin-top: 6px; padding-top: 10px; }
  .bx-focus > summary { cursor: pointer; font-size: 14px; color: var(--ink); }
  .bx-focus-heading { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); margin: 10px 0 4px; }
  .bx-focus-item { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; font-size: 13.5px; line-height: 1.4; cursor: pointer; }
  .bx-focus-item input { margin-top: 3px; flex: 0 0 auto; }
```

- [ ] **Step 4: Compile gate**

Run: `npm run check:ui`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run: `npx vercel dev`. Pick Year 11 → Biology → the "Curriculum focus (optional)" panel loads the Areas of Study as checkboxes; tick two. Pick Year 7 → Science → content descriptions load, grouped by strand, each showing its `AC9…` code; tick two. Change subject → ticks clear and the new list loads. Turn off Wi-Fi / stop the dev server mid-select → a soft error line shows and generation is still possible. Confirm the panel never appears for "Other / not listed".

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(ui): tickable curriculum focus panel in the brain builder"
```

---

### Task 7: Send focus + write it into LAUNCH notes + version bump (frontend)

**Files:**
- Modify: `index.html` (`generateSpringboard` body; `generate()` deck stamp; export notes builder; `APP_VERSION`)

**Interfaces:**
- Consumes: `classInfo.focus`, the existing `studyGuide` send in `generateSpringboard`, the `deck` object in `generate()`, the pptx notes builder that appends "Curriculum connection".
- Produces: `studyGuide.focus` reaches the server; `deck.curriculumFocus` carries the ticked strings; the LAUNCH speaker notes gain a "Curriculum focus (teacher)" line. No projected-slide change.

- [ ] **Step 1: Send `focus` inside the `studyGuide` payload**

In `generateSpringboard`, replace the `const studyGuide = vceGuide || acGuide;` line and the body's `...(studyGuide ? { studyGuide } : {})` spread with a focus-aware version:

```javascript
  const baseGuide = vceGuide || acGuide;
  const focus = Array.isArray(classInfo.focus) ? classInfo.focus : [];
  const studyGuide = baseGuide ? (focus.length ? { ...baseGuide, focus } : baseGuide) : null;
```

(The body spread `...(studyGuide ? { studyGuide } : {})` now carries `focus` automatically.)

- [ ] **Step 2: Stamp the ticked focus onto the deck**

In `generate()`, right after `const deck = shapeDeck(parsed, { routineName: selectedRoutine });`, add:

```javascript
      deck.curriculumFocus = Array.isArray(classInfo.focus) ? classInfo.focus.slice() : [];
```

- [ ] **Step 3: Write focus into the LAUNCH speaker notes**

Find the pptx notes builder line that appends the curriculum connection:

```javascript
          const conn = ((deck.launch && deck.launch.connection) || "").trim(); if (conn) out += "\n\nCurriculum connection: " + conn;
```

Immediately after it, add:

```javascript
          if (Array.isArray(deck.curriculumFocus) && deck.curriculumFocus.length) out += "\n\nCurriculum focus (teacher): " + deck.curriculumFocus.join("; ");
```

- [ ] **Step 4: Bump the version**

Change `const APP_VERSION = "v0.9.17 · 2026-07-24";` to:

```javascript
const APP_VERSION = "v0.9.18 · 2026-07-24";
```

- [ ] **Step 5: Compile gate + full backend suite**

Run: `npm run check:ui`
Expected: PASS.
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(ui): send ticked curriculum focus to generation and into LAUNCH notes; v0.9.18"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Both gates**

Run: `npm test` → Expected: PASS.
Run: `npm run check:ui` → Expected: PASS.

- [ ] **Step 2: Live path with a real deck**

Run: `npx vercel dev`. Full run: enter a move → Year 11 → Biology → tick 2 Areas of Study → add an image/article → Analyse → pick a routine → **Make the lesson** → download the deck. Open the .pptx: confirm the ticked Areas of Study appear in the **LAUNCH speaker notes** ("Curriculum focus (teacher): …") and NOT on any projected slide. Repeat for Year 7 → Science → 2 content descriptions.

- [ ] **Step 3: Skip path**

Same flow but tick nothing → lesson still generates and the notes have no "Curriculum focus" line (behaviour matches today).

- [ ] **Step 4: Refresh reset**

Reload the page → Year/Subject/focus are all cleared (settings don't persist).

- [ ] **Step 5: Push (auto-deploys)**

```bash
git push
```

After deploy, load the live site and confirm the footer shows `v0.9.18`.

---

## Self-Review

**Spec coverage:**
- Year-driven picker (VCE Y11/12, ACARA F–10) → Task 5. ✓
- Tickable items → Tasks 2, 3, 6. ✓
- Ticks focus generation → Tasks 4, 7. ✓
- Ticks written to teacher-only LAUNCH notes → Task 7. ✓
- Optional (skip = today's behaviour) → Task 4 (no-focus identical), Task 8 Step 3. ✓
- New read-only endpoint, same gates + allowlist → Task 3. ✓
- Shared parsing module / targeted refactor → Task 1. ✓
- `vercel.json` ships guides with `guide.js` → Task 3 Step 5. ✓
- Settings don't persist; curriculum teacher-only; version bump; both gates; Classic untouched → Global Constraints + Tasks 5–8. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the code; commands have expected output. ✓

**Type consistency:** `parseItems` returns `[{heading, items:[{id,text}]}]` in Task 2 and is consumed with those exact fields in Tasks 3 (endpoint) and 6 (UI). `studyGuide.focus` produced in Task 7 matches the shape read in Task 4. `deck.curriculumFocus` set in Task 7 Step 2 matches the read in Task 7 Step 3. `subjectFreeform`/`focusGroups`/`focusLoading`/`focusError` declared in Task 5 Step 2, used in Tasks 5–6. ✓

**Concurrency note:** Before editing `index.html`, re-check `git status` and the file mtime — a second Claude window may be mid-edit (per project memory). Rebase your reading if it changed.
