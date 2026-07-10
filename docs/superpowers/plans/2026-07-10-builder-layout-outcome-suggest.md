# Full-width builder + AI outcome suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four approved changes to Springboard's builder: outcome paste-or-AI-suggest choice, full-width builder until Generate, fresh class settings on every load, Year level above Subject.

**Architecture:** All changes live in `index.html` (single-file React app, in-browser Babel, no build step). AI suggestions reuse the existing `/api/generate` Vercel proxy (key server-side) mirroring `analyseStimulus`'s request packaging, including `studyGuide` injection for VCE Y11/12. Layout switches on a derived `previewOpen` flag; no new persistence.

**Tech Stack:** React 18 UMD + Babel-standalone in one HTML file; Node test runner for API tests; `tools/compile-check.mjs` for JSX compile check.

**Testing reality:** UI has no unit-test harness — the repo's gates are `npm test` (API only, must stay green) and `npm run check:ui` (Babel compile of the inline JSX). Every task runs both; behavioural verification is a scripted browser pass at the end (Task 6). This is the repo's established pattern, not a shortcut.

## Global Constraints

- Single file: all UI edits in `index.html`. No backend file changes.
- Teacher passcode persistence (`sb_passcode`) MUST survive; only `sb_class` persistence dies.
- Curricula default stays `"IB MYP"`.
- Version bump to `v0.4.0 · 2026-07-10` (line 520) in the final code task only.
- ≤980px viewport keeps single-column stacking in both layout states.
- No invented curriculum codes in AI prompts (mirror existing outcomeLine rules).
- Commit after each task; never push without Nathan's OK.

---

### Task 1: Fresh start on refresh

**Files:**
- Modify: `index.html:620-632` (`loadClassInfo`), `index.html:1633` (`saveClassInfo` storage write)

**Interfaces:**
- Produces: `loadClassInfo()` → always `{ curriculum: "IB MYP", subject: "", yearLevel: "", outcome: "" }`; also clears any stale `sb_class` key. `saveClassInfo` keeps its signature, just no storage write.

- [ ] **Step 1: Replace `loadClassInfo` body** (keep `CLASS_STORE` const for the cleanup):

```js
// Class settings deliberately DON'T persist (fresh lesson every visit — per Nathan,
// 2026-07-10). loadClassInfo clears any pre-v0.4.0 stored value so old browsers reset too.
function loadClassInfo() {
  try { localStorage.removeItem(CLASS_STORE); } catch (_) {}
  return { curriculum: "IB MYP", subject: "", yearLevel: "", outcome: "" };
}
```

- [ ] **Step 2: Delete the storage write in `saveClassInfo`** — remove line:

```js
    try { localStorage.setItem(CLASS_STORE, JSON.stringify(next)); } catch (_) {}
```

- [ ] **Step 3: Run checks**

Run: `npm run check:ui && npm test` — Expected: compile OK, all tests pass.

- [ ] **Step 4: Commit** — `git commit -m "feat: class settings start fresh on every visit"`

---

### Task 2: Year level above Subject

**Files:**
- Modify: `index.html:2382-2403` (class-settings field rows)

- [ ] **Step 1: Move the Year-level `field-row` div (`f-year`, lines 2399-2403) to immediately BEFORE the Subject `field-row` div (`f-subj`, line 2382).** Resulting order: Curriculum → Year level → Subject → Outcome. No other edits.

- [ ] **Step 2: Run checks** — `npm run check:ui && npm test` — Expected: green.

- [ ] **Step 3: Commit** — `git commit -m "feat: year level field above subject"`

---

### Task 3: Outcome field — paste from planner OR AI suggestions

**Files:**
- Modify: `index.html` — CSS (~line 247, after routine-card rules), client fn (after `analyseStimulus`, ~line 1456), App state (~line 1648), handler (near `logEvent`), outcome field-row JSX (2404-2409)

**Interfaces:**
- Consumes: `vceStudyGuide(classInfo)`, `API_BASE`, `backendErrorMessage`, `parseJsonLoose`, `stripMd`, `saveClassInfo`, `.routine-card*` CSS, `.modes` CSS, `spinner sm dark`.
- Produces: `async function suggestOutcomes({ passcode, mode, media, sourceText, classInfo })` → `Promise<[{outcome: string, why: string}]>` (1-4 items, throws on failure). App state: `outcomeMode` ("paste"|"ai"), `suggests` (array|null), `suggesting` (bool), `suggestError` (string). CSS: `.modes.sm`.

- [ ] **Step 1: CSS — small variant of the mode toggle** (after `.routine-card-link:hover`, line 247):

```css
  .modes.sm { margin-top: 2px; }
  .modes.sm button { padding: 7px 6px; font-size: 12.5px; }
```

- [ ] **Step 2: Client function** after `analyseStimulus` (mirrors its media packaging; adds `studyGuide` like `generateSpringboard` does at 1361-1373):

```js
/* Suggest 1-4 curriculum connections (outcomes) for the class, grounded in the stimulus when
   one exists. VCE Y11/12: server injects the real study-design extract via studyGuide. */
async function suggestOutcomes({ passcode, mode, media = [], sourceText = "", classInfo }) {
  const guide = vceStudyGuide(classInfo);
  const sys = `You help a ${classInfo.curriculum} teacher of ${classInfo.subject}, year ${classInfo.yearLevel}, connect a lesson stimulus to their curriculum.
Return STRICT JSON only: {"suggestions": [{"outcome": string (<=30 words, one curriculum connection/outcome this lesson could target), "why": string (<=18 words, why it fits this stimulus and class)} x4]}
${guide ? "A VCE study-design extract is appended below. Ground every suggestion in ITS areas of study and outcomes, quoting real phrases; never invent codes." : "Use plain language. Never invent official curriculum codes or identifiers."}`;

  const userContent = [];
  const mediaItems = Array.isArray(media) ? media : [];
  if (mode === "media" && mediaItems.length) {
    userContent.push({ type: "text", text: "Suggest curriculum connections for this stimulus per the system instructions." });
    mediaItems.forEach(m => {
      if (m.kind === "image") userContent.push({ type: "image_url", image_url: { url: m.dataUrl } });
      else (m.frames || []).forEach(fr => userContent.push({ type: "image_url", image_url: { url: fr } }));
    });
  } else if ((sourceText || "").trim()) {
    const trimmed = sourceText.slice(0, 12000).replace(/"{3,}/g, "“”");
    userContent.push({ type: "text", text: `Suggest curriculum connections for this article per the system instructions:\n\n"""\n${trimmed}\n"""` });
  } else {
    userContent.push({ type: "text", text: "No stimulus added yet. Suggest curriculum connections a teacher of this class could build a lesson around, per the system instructions." });
  }

  const resp = await fetch(API_BASE + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sb-passcode": passcode },
    body: JSON.stringify({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
      ...(guide ? { studyGuide: guide } : {}),
    }),
  });
  if (!resp.ok) throw new Error(await backendErrorMessage(resp));

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  if (!raw.trim()) throw new Error("The model returned an empty response.");
  const parsed = parseJsonLoose(raw);
  const out = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .map(s => ({ outcome: stripMd(s && s.outcome), why: stripMd((s && s.why) || "") }))
    .filter(s => s.outcome);
  if (!out.length) throw new Error("No suggestions came back — try again.");
  return out.slice(0, 4);
}
```

- [ ] **Step 3: App state** (next to the analyse-step state, ~line 1648):

```js
  // Outcome source: teacher pastes from planner, or AI suggests curriculum connections.
  const [outcomeMode, setOutcomeMode] = useState("paste"); // "paste" | "ai"
  const [suggests, setSuggests] = useState(null);          // [{outcome, why}] | null
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
```

- [ ] **Step 4: Handler in App** (after `logEvent`):

```js
  async function runSuggestOutcomes() {
    setSuggesting(true); setSuggestError("");
    try {
      const list = await suggestOutcomes({ passcode, mode, media, sourceText: articleText, classInfo });
      setSuggests(list);
      logEvent("suggest_outcomes", { stimulusType: mode === "media" ? (media[0]?.kind || "none") : "article" });
    } catch (err) {
      setSuggests(null); setSuggestError(String(err && err.message || err));
    } finally { setSuggesting(false); }
  }
```

- [ ] **Step 5: Replace the outcome `field-row`** (2404-2409) with the tabbed version:

```jsx
            <div className="field-row">
              <label htmlFor="f-outcome">Outcome or topic (optional)</label>
              <div className="modes sm" role="group" aria-label="Outcome source">
                <button type="button" className={outcomeMode === "paste" ? "active" : ""} aria-pressed={outcomeMode === "paste"} onClick={() => setOutcomeMode("paste")}>Paste from planner</button>
                <button type="button" className={outcomeMode === "ai" ? "active" : ""} aria-pressed={outcomeMode === "ai"} onClick={() => setOutcomeMode("ai")}>AI suggestions</button>
              </div>
              {outcomeMode === "paste" && (
                <textarea id="f-outcome" rows={2} style={{ marginTop: 8 }}
                          placeholder="e.g. 'Students analyse how text structures shape meaning' or 'Unit: Body systems'"
                          value={classInfo.outcome} onChange={e => saveClassInfo({ ...classInfo, outcome: e.target.value })} />
              )}
              {outcomeMode === "ai" && (
                <React.Fragment>
                  <button type="button" className="btn ghost" style={{ marginTop: 8 }}
                          disabled={suggesting || !classInfo.subject.trim() || !classInfo.yearLevel.trim()}
                          aria-busy={suggesting} onClick={runSuggestOutcomes}>
                    {suggesting
                      ? <React.Fragment><span className="spinner sm dark"></span> Suggesting…</React.Fragment>
                      : <React.Fragment><Icon d={I.generate} size={16} stroke /> {suggests ? "Suggest again" : "Suggest connections"}</React.Fragment>}
                  </button>
                  {(!classInfo.subject.trim() || !classInfo.yearLevel.trim())
                    ? <div className="hint">Fill in year level and subject first. Adding a stimulus makes suggestions sharper.</div>
                    : <div className="hint">Suggests where {suggests ? "this" : "your"} lesson could connect to the curriculum — pick one, then edit it freely.</div>}
                  {suggestError && <div className="alert bad" role="alert">{suggestError}</div>}
                  {suggests && (
                    <div className="routine-cards">
                      {suggests.map(s => (
                        <div className={"routine-card" + (classInfo.outcome === s.outcome ? " on" : "")} key={s.outcome}>
                          <label className="routine-card-pick">
                            <input type="radio" name="outcomeCard" value={s.outcome}
                              checked={classInfo.outcome === s.outcome} onChange={() => saveClassInfo({ ...classInfo, outcome: s.outcome })} />
                            <span>{s.outcome}</span>
                          </label>
                          <p className="routine-card-why">{s.why}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {classInfo.outcome.trim() !== "" && (
                    <React.Fragment>
                      <div className="hint" style={{ marginTop: 8 }}>Chosen outcome (edit freely):</div>
                      <textarea id="f-outcome" rows={2} aria-label="Chosen outcome"
                                value={classInfo.outcome} onChange={e => saveClassInfo({ ...classInfo, outcome: e.target.value })} />
                    </React.Fragment>
                  )}
                </React.Fragment>
              )}
            </div>
```

- [ ] **Step 6: Run checks** — `npm run check:ui && npm test` — Expected: green.

- [ ] **Step 7: Commit** — `git commit -m "feat: outcome field offers paste-from-planner or AI curriculum-connection suggestions"`

---

### Task 4: Full-width builder; preview only after Generate

**Files:**
- Modify: `index.html` — CSS 129-145 (layout rules), JSX 2278 (`<main>`), 2280-2478 (input panel wrappers), 2480-2488 (preview column gate + empty state)

**Interfaces:**
- Produces: `previewOpen` (bool, in App render scope) = `loading || Object.keys(spots).length > 0`. CSS: `.layout.pre`, `.icol`.

- [ ] **Step 1: CSS** — after the existing `@media` rule at line 136, add:

```css
  /* Pre-generate: the builder owns the full width; the panel splits into two internal
     columns (stimulus | class+generate). After Generate: classic 380px + preview. */
  .layout.pre { grid-template-columns: 1fr; }
  .layout.pre .panel.input { position: static; display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; align-items: start; }
  .layout:not(.pre) .panel.input .icol { display: contents; }
  @media (max-width: 980px) { .layout.pre .panel.input { display: block; } }
```

- [ ] **Step 2: Derive `previewOpen` in App** (next to the `spot` derivation ~line 1679):

```js
  // Preview earns its column only once Generate is clicked (loading) or a deck exists;
  // before that the builder takes the full width (.layout.pre).
  const previewOpen = loading || Object.keys(spots).length > 0;
```

- [ ] **Step 3: Flag the layout** — line 2278:

```jsx
      <main className={"layout" + (previewOpen ? "" : " pre")}>
```

- [ ] **Step 4: Wrap the input panel's children in two `.icol` divs.** First `.icol`: stimulus-mode group, media group, article group, title group (2281-2371). Second `.icol`: class-settings group, analyse group, generate button, its hint, sr-only status, error alert (2373-2477). Pure wrapping, no content changes.

- [ ] **Step 5: Gate the preview column and replace the empty state.** Change `2480-2488` to:

```jsx
        {/* ----------------- PREVIEW PANEL (only after Generate) ----------------- */}
        {previewOpen && (
        <div>
          {!spot && loading && (
            <div className="panel"><div className="empty">
              <div className="big" aria-hidden="true"><Icon d={I.generate} size={46} /></div>
              <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)" }}>Building your Springboard…</h2>
              <p>This takes a moment — the editable preview will appear right here.</p>
            </div></div>
          )}
```

and close that conditional (`)}`) where the preview column div closes.

- [ ] **Step 6: Run checks** — `npm run check:ui && npm test` — Expected: green.

- [ ] **Step 7: Commit** — `git commit -m "feat: full-width builder until Generate; preview panel appears on the right after"`

---

### Task 5: Version bump + full checks

- [ ] **Step 1:** line 520 → `const APP_VERSION = "v0.4.0 · 2026-07-10";`
- [ ] **Step 2:** `npm run check:ui && npm test` — Expected: green.
- [ ] **Step 3: Commit** — `git commit -m "feat: outcome suggestions, full-width builder, fresh start, field order; v0.4.0"`

---

### Task 6: Browser verification (behavioural)

Serve `index.html` (file:// is fine; API_BASE then points at localhost:3000, so AI calls are stubbed). Use Chrome DevTools MCP:

- [ ] Fresh load → `.layout` has `pre` class; NO preview/empty panel; builder spans full width, two internal columns; class settings blank with curriculum `IB MYP`.
- [ ] Field order: Curriculum → Year level → Subject → Outcome.
- [ ] Outcome tabs: default Paste (textarea). Switch to AI suggestions → button disabled until year+subject filled; fill them → enabled. Typed outcome survives tab switches.
- [ ] Fill year/subject/outcome → reload → all blank again (fresh start proven).
- [ ] Stub `window.fetch` for `/api/generate` (canned analyse JSON, then canned suggestions JSON) → suggestion cards render; clicking one fills the editable outcome box.
- [ ] Click Generate (with stubbed deck or observe loading state) → layout flips to two-column with preview column present.
- [ ] Resize to 900px width → single stacked column in both states.
- [ ] Deployed API contract: `curl -X POST https://springboard-dlp-s-projects.vercel.app/api/generate` with a suggest-style body (incl. `studyGuide: {key:"english", units:"3-4"}`) → 200 with `suggestions` JSON (proves server path incl. guide injection).
