# Deck Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight defects Nathan found in a real Year 4 deck — remove the content advisory, stop the AI printing curriculum descriptors and contradictory timings, make the reveal button fully clickable and self-describing, and replace the fixed drain-bar timer with a changeable digital countdown.

**Architecture:** Everything lives in `index.html` (single-file React app, in-browser Babel, no bundler, one scope) plus the deck audit in `tools/audit-deck.mjs`. Five fixes are prompt-rule edits inside the `generateSpringboard` prompt builder. Three are deck-builder changes inside `buildDeckBlob`. The timer additionally needs new click-triggered animation XML spliced by `injectThinkAnimations`, following the pattern already used for the drain bar and the reveal pill.

**Tech Stack:** React 18 + Babel standalone (CDN, in-page), PptxGenJS + JSZip (CDN in the app, `node_modules` for the audit), Node's built-in test runner, headless Chromium via CDP for the deck audit.

**Spec:** `docs/superpowers/specs/2026-07-31-deck-quality-fixes-design.md`

## Global Constraints

- **No `api/` changes are expected.** If any turn out to be needed, `vercel --prod --yes` and an OPTIONS check are mandatory per `CLAUDE.md` — pushing does not deploy the backend.
- **`npm test` and `npm run check:ui` must both pass before every commit.** `check:ui` is the only thing that catches JSX syntax errors before production.
- `npm run audit` (1003 assertions) must pass before the final commit.
- Work commits straight to `main`. No feature branches.
- Bump the `APP_VERSION` const in `index.html` (~line 676) on the final user-visible commit.
- Wesley brand palette only. `tools/audit-deck.mjs:264` reads the palette out of the app's own colour constants and fails on any off-palette hex, so new colours must reuse existing constants (`P`, `INK`, `GOLD`, `GOLD_INK`, `MUTED`, `WHITE`, `AMBER`).
- No em-dashes in user-facing copy.
- `shapeDeck` must stay tolerant of decks missing new fields so previously saved lessons still load.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `index.html` ~2520-2555 | `shapeDeck` — normalises the model's JSON into a deck | drop `advisory`, add `think.reveal.label`, add `think.minutes` |
| `index.html` ~2638-2708 | `generateSpringboard` prompt builder | five prompt-rule edits, drop advisory from the schema |
| `index.html` ~3364-3427 | `injectThinkAnimations` + effect XML helpers | new countdown + preset-button triggers |
| `index.html` ~4385, ~4650-4660, ~4411 | `buildDeckBlob` — advisory slide and slide count | remove |
| `index.html` ~4772-4787 | `buildDeckBlob` — THINK timer | move bottom-right, digital countdown, presets |
| `index.html` ~4833-4843 | `buildDeckBlob` — reveal pill | single clickable object + label |
| `index.html` ~5560-5580, ~6290-6310, ~373-399, ~3625 | editor UI + CSS | remove advisory UI, add minutes field |
| `tools/audit-deck.mjs` | deck invariants | drop the advisory scenario, add reveal/timer assertions |

---

### Task 1: Spike the digital countdown (throwaway)

The timer is the only part of this plan whose feasibility is unknown. Answer that before building anything else. **Nothing from this task ships** — it is a scratch script whose output is a written finding.

**Files:**
- Create: `<scratchpad>/timer-spike.mjs` (scratch directory, NOT the repo)
- Create: `docs/superpowers/plans/2026-07-31-timer-spike-findings.md`

**Interfaces:**
- Consumes: nothing
- Produces: a decision recorded in the findings file — one of `full` (presets 1/2/3/5 at 1-second resolution), `reduced` (presets 1/2/3), `coarse` (5-second steps), or `bar` (keep the draining bar, move it, add presets). Task 6 reads this decision and builds only that variant.

- [ ] **Step 1: Write the spike script**

Uses the same `pptxgenjs` + `jszip` already in `node_modules`. Builds ONE slide with a shared stack of `MM:SS` labels and four preset buttons, splices the timing XML by hand, and writes the file.

```js
// <scratchpad>/timer-spike.mjs
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import fs from "node:fs";

const MAXSEC = 300;                       // 5:00 is the largest preset
const PRESETS = [60, 120, 180, 300];
const CLOCK = { x: 10.9, y: 6.35, w: 1.8, h: 0.5 };   // bottom-right of a 13.333 x 7.5 slide
const mmss = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
const s = pptx.addSlide();
s.addText("Spike: does a 301-box countdown stay usable?", { x: 0.7, y: 0.6, w: 11, h: 0.6, fontSize: 24 });

// Preset buttons, left of the clock. One object each, text drawn INSIDE the shape so the
// whole button is clickable (this is also the fix Task 3 applies to the reveal pill).
PRESETS.forEach((sec, i) => {
  s.addText(sec / 60 + " min", {
    shape: pptx.ShapeType.roundRect, rectRadius: 0.1, fill: { color: "EDE4D2" },
    x: 7.9 + i * 0.78, y: 6.35, w: 0.72, h: 0.5,
    fontSize: 10, bold: true, color: "2B281F", align: "center", valign: "middle",
    objectName: "SB-TIMERBTN::" + sec,
  });
});

// Shared stack of second-labels, descending so 0:00 is drawn LAST and therefore sits on top:
// each label that appears covers the one before it, which is what makes the digits change.
// Opaque fill, or the labels underneath show through.
for (let sec = MAXSEC; sec >= 0; sec--) {
  s.addText(mmss(sec), {
    ...CLOCK, fill: { color: "FFFFFF" },
    fontSize: 22, bold: true, color: "2B281F", align: "center", valign: "middle",
    objectName: "SB-CLOCK::" + sec,
  });
}

const blob = await pptx.write({ outputType: "nodebuffer" });
const zip = await JSZip.loadAsync(blob);
let xml = await zip.file("ppt/slides/slide1.xml").async("string");

const idOf = name => {
  const m = xml.match(new RegExp('<p:cNvPr id="(\\d+)" name="' + name + '"'));
  return m ? m[1] : null;
};
let nextId = 2;
for (const m of xml.matchAll(/<p:cTn id="(\d+)"/g)) nextId = Math.max(nextId, +m[1] + 1);

// Appear at a delay: same shape as the app's sbAppearEffect but with a settable delay.
const appearAt = (id, spid, ms) =>
  `<p:par><p:cTn id="${id}" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="afterEffect"><p:stCondLst><p:cond delay="${ms}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${id + 1}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par>`;
const seq = (id, trigSpid, effects) =>
  `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${id}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${trigSpid}"/></p:tgtEl></p:cond></p:stCondLst><p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst><p:par><p:cTn id="${id + 1}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${id + 2}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:nextCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${trigSpid}"/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`;

const seqs = [], builds = new Set();
for (const sec of PRESETS) {
  const trig = idOf("SB-TIMERBTN::" + sec);
  const effects = [];
  for (let t = sec; t >= 0; t--) {
    const spid = idOf("SB-CLOCK::" + t);
    effects.push(appearAt(nextId + 3 + (sec - t) * 2, spid, (sec - t) * 1000));
    builds.add(`<p:bldP spid="${spid}" grpId="0"/>`);
  }
  seqs.push(seq(nextId, trig, effects.join("")));
  nextId += 3 + (sec + 1) * 2 + 1;
}
const timing = `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${seqs.join("")}</p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${[...builds].join("")}</p:bldLst></p:timing>`;
xml = xml.replace(/<\/p:sld>/, timing + "</p:sld>");
zip.file("ppt/slides/slide1.xml", xml);

const out = await zip.generateAsync({ type: "nodebuffer" });
fs.writeFileSync("timer-spike.pptx", out);
console.log("slide XML bytes:", xml.length, "| file bytes:", out.length);
```

- [ ] **Step 2: Run it and record the size**

Run: `node timer-spike.mjs` from the scratchpad directory.
Expected: writes `timer-spike.pptx` and prints two byte counts. Record both.

- [ ] **Step 3: Verify the XML is internally consistent before opening it**

Reuse the invariants `tools/audit-deck.mjs` already enforces, because a deck that violates them makes PowerPoint offer to repair the file:

```js
// append to timer-spike.mjs, or run as a second script over the same xml
const ids = [...xml.matchAll(/<p:cTn id="(\d+)"/g)].map(m => +m[1]);
console.log("timing ids unique:", new Set(ids).size === ids.length);
const spids = [...xml.matchAll(/<p:spTgt spid="(\d+)"\/>/g)].map(m => m[1]);
const shapeIds = new Set([...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1]));
console.log("all targets exist:", spids.every(s => shapeIds.has(s)));
console.log("one timing block:", (xml.match(/<p:timing>/g) || []).length === 1);
```

Expected: all three print `true`. If any print `false`, fix the id arithmetic before opening the file — duplicate `cTn` ids are the known cause of "PowerPoint found a problem with content".

- [ ] **Step 4: Open it in real PowerPoint and judge it**

Open `timer-spike.pptx` by hand. Answer all five, in writing:

1. Does it open with **no** repair prompt?
2. How long does it take to open, versus an existing deck from Downloads?
3. In the slideshow, does clicking "2 min" produce a countdown that visibly ticks 2:00, 1:59, 1:58…?
4. Does it keep roughly correct time over a full 2 minutes (within a couple of seconds)?
5. Does clicking a different preset mid-countdown restart cleanly, or do two countdowns fight?

- [ ] **Step 5: Record the decision**

Write `docs/superpowers/plans/2026-07-31-timer-spike-findings.md` with the byte counts, the five answers, and one of these verdicts:

- **`full`** — all five good. Task 6 builds presets 1/2/3/5 at 1-second resolution.
- **`reduced`** — works but heavy. Drop the 5 min preset (max ~181 boxes) and re-run this spike to confirm.
- **`coarse`** — still heavy at 3 min. Count in 5-second steps (~61 boxes for 5 minutes) and re-run.
- **`bar`** — the countdown is unusable in PowerPoint. Keep the existing draining-bar mechanic, move it bottom-right, and add preset buttons that each trigger a differently-timed wipe.

**Report the verdict to Nathan in plain English before starting Task 6.** He chose the digital clock on the understanding it might not survive contact with PowerPoint; if it lands on `coarse` or `bar` he needs to know what he is actually getting.

- [ ] **Step 6: Commit the findings only**

```bash
git add docs/superpowers/plans/2026-07-31-timer-spike-findings.md
git commit -m "docs: spike findings for the PowerPoint digital countdown timer"
```

The scratch `.mjs` and `.pptx` stay out of the repo.

---

### Task 2: Remove the content advisory completely

**Files:**
- Modify: `index.html:2525`, `:2553` (shapeDeck), `:2647`, `:2648` (prompt), `:3625`, `:4249` (state), `:4385`, `:4411`, `:4650-4660` (deck builder), `:5569-5576`, `:6296-6307` (editor UI), `:373-399`, `:525`, `:918-920` (CSS)
- Modify: `tools/audit-deck.mjs:37`, `:44-45`, `:232`

**Interfaces:**
- Consumes: nothing
- Produces: `shapeDeck` no longer returns an `advisory` key. Any later task reading `deck.advisory` is a bug.

- [ ] **Step 1: Write the failing assertion first**

In `tools/audit-deck.mjs`, replace the advisory assertion at line 232:

```js
  check(cfg.id, "no content advisory slide is ever produced", !/CONTENT ADVISORY/.test(joined), "advisory slide still rendered");
```

- [ ] **Step 2: Make the advisory scenario prove it**

The `media-advisory` config exists to force the advisory on. Keep the scenario (it is the only `mode: "media"` config with reflect on, so deleting it loses media coverage) but rename it and drop the flag. Replace lines 44-45:

```js
  { id: "media-reflect", mode: "media", reflect: true, deck: baseDeck() },
```

And delete the now-unused `advisory` key from `baseDeck` at line 37.

- [ ] **Step 3: Run the audit to verify it fails**

Run: `npm run audit:deck`
Expected: FAIL — `media-reflect` still renders `CONTENT ADVISORY`, because `baseDeck` no longer sets the flag but the *app* still reads `deck.advisory` and the stubbed deck no longer has it. Read the actual failure text before continuing; if it passes at this point the assertion is not exercising anything and needs rethinking.

- [ ] **Step 4: Remove advisory from `shapeDeck`**

At `index.html:2525`, drop `, ad = obj(p.advisory)` from the destructuring line. Delete line 2553 entirely:

```js
    advisory:{ flag: !!ad.flag, reason: str(ad.reason) },
```

- [ ] **Step 5: Remove advisory from the generation prompt**

Delete `index.html:2647`:

```
Set advisory.flag true only for sensitive themes (grief, violence, body image, etc.) with a one-line reason.
```

And in the returned-keys list at line 2648, delete the trailing `, advisory{flag, reason}`.

- [ ] **Step 6: Remove the advisory slide and its slide-count term**

Delete `index.html:4385` (`const showAdvisory = ...`), the whole `// ---------------- ADVISORY ...` block at lines 4650-4660, and the `(showAdvisory ? 1 : 0) + ` term from the `total` expression at line 4411.

- [ ] **Step 7: Remove the editor UI, state and CSS**

- Delete the `includeAdvisory` state at line 3625 and its reset at line 4249.
- Delete the advisory block in the two-column editor at lines 5569-5576.
- Delete the advisory block in the brain-view editor at lines 6296-6307.
- Delete the `.advisory-*` CSS rules at lines 373-399 and 918-920, and remove `.advisory-chip.on, ` from the selector list at line 525.

- [ ] **Step 8: Confirm nothing still references it**

Run: `grep -n "advisory\|Advisory\|ADVISORY\|includeAdvisory" index.html tools/audit-deck.mjs`
Expected: only the new negative assertion in `tools/audit-deck.mjs`. Any other hit is dead code to remove.

- [ ] **Step 9: Run the gates**

Run: `npm run check:ui && npm test && npm run audit:deck`
Expected: all pass, and the deck audit's advisory assertion now passes for every config.

- [ ] **Step 10: Commit**

```bash
git add index.html tools/audit-deck.mjs
git commit -m "feat(deck): drop the content advisory slide

It took a numbered student slide slot ahead of IGNITE and Nathan does not
want it in front of a class. The slide, the model field, the teacher toggle
and the CSS all go, and the audit now asserts no deck can produce one."
```

---

### Task 3: Reveal pill — one clickable object, and say what it reveals

**Files:**
- Modify: `index.html:2538` (shapeDeck), `:2693` (prompt), `:4833-4843` (deck builder)
- Modify: `tools/audit-deck.mjs` (new assertions)

**Interfaces:**
- Consumes: nothing
- Produces: `deck.think.reveal.label` — a string, `""` when the model omits it. Task 4's prompt edits must keep emitting it.

- [ ] **Step 1: Write the failing assertions**

Add to `tools/audit-deck.mjs`, immediately after the existing reveal check at line 234:

```js
  if (wantReveal) {
    // The pill and its label used to be two objects, so only the pill's edges responded to a
    // click (Nathan, 2026-07-31). One object means the whole pill is the click target.
    const think = slideNames.map((_, i) => xmlOf(i + 1)).find(x => /Click to reveal/.test(textOf(x)));
    const pill = (think || "").match(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?Click to reveal[\s\S]*?<\/p:sp>/);
    check(cfg.id, "reveal pill is one shape carrying its own text", !!pill && /<a:prstGeom prst="roundRect"/.test(pill[0]), "label is a separate object from the clickable shape");
    check(cfg.id, "reveal button names what it reveals",
      new RegExp("Click to reveal: " + cfg.deck.think.reveal.label).test(joined) || !cfg.deck.think.reveal.label, "generic label");
  }
```

- [ ] **Step 2: Give the audit's fixtures a label**

In `tools/audit-deck.mjs`, add `label` to both reveal fixtures. Line 27:

```js
    reveal: { fact: "This tree was photographed in 2019, and the woodland around it was cleared in 1957.", question: "What does that change about how old you thought it was?", label: "when it was taken" },
```

And in the `stress-long-text` config at line 54:

```js
      d.think.reveal = { fact: LONG.slice(0, 190), question: "What does that change about who you thought this was made for and why?", label: "who made it" };
```

- [ ] **Step 3: Run the audit to verify it fails**

Run: `npm run audit:deck`
Expected: FAIL on both new checks — the pill is still two objects and the button still reads `Click to reveal  ▸`.

- [ ] **Step 4: Carry the label through `shapeDeck`**

At `index.html:2538`, add `label` to the reveal object:

```js
               reveal: { fact: str((th.reveal || {}).fact), question: str((th.reveal || {}).question), label: str((th.reveal || {}).label) } },
```

- [ ] **Step 5: Ask the model for it**

In the `think.reveal` rule at `index.html:2693`, extend the returned shape. Replace the opening of that template string so it reads:

```js
    `think.reveal: {"fact": the single most surprising TRUE thing about this stimulus, stated in one sentence students can read (<=30 words) — who made it, when, what it leaves out, who is missing, where it really came from; "question": ONE complete question (<=20 words) asking what that fact changes about the thinking they just committed to; "label": <=4 words naming WHAT is behind the reveal button, so a teacher reading the slide knows what they are about to show (e.g. "the painting's origin", "when it was taken"). Do NOT give the surprise away in the label — name the topic, not the fact}. NEVER invent a fact to be surprising: if nothing genuinely surprising is knowable from the stimulus, return {"fact": "", "question": "", "label": ""} and the reveal is left off the slide entirely. The question must stand alone — "What changes?" is a failure; name what changes and about what.`,
```

- [ ] **Step 6: Draw the pill as ONE object**

Replace `index.html:4835-4836` (the `addShape` + `addText` pair) with a single `addText` that carries the shape:

```js
          const rvLabel = ((deck.think && deck.think.reveal && deck.think.reveal.label) || "").trim();
          const pillText = rvLabel ? "Click to reveal: " + rvLabel : "Click to reveal the surprise";
          const pillW = Math.max(2.15, Math.min(4.6, 0.16 * pillText.length + 0.5));
          s.addText(pillText, {
            shape: pptx.ShapeType.roundRect, rectRadius: 0.2, fill: { color: GOLD },
            x: 0.7, y: pillY, w: pillW, h: 0.42,
            fontSize: 12.5, bold: true, color: INK, align: "center", valign: "middle", fontFace: FONT,
            objectName: SB_REVEAL_TRIGGER,
          });
```

Note `pillW` is now computed above its first use — the old `const pillW = 2.15, pillY = 5.32;` on line 4834 becomes `const pillY = 5.32;` and `pillW` moves into the block above.

- [ ] **Step 7: Update the teacher-notes wording**

At `index.html:4847`, the note names the button. Change:

```js
              + "\nIt is hidden on the slide until you click the gold \"" + pillText + "\" button — collect students' guesses first, then click."
```

- [ ] **Step 8: Run the audit and confirm the animation still binds**

Run: `npm run audit:deck`
Expected: PASS, including the pre-existing `animation targets exist` and `every animated shape is in bldLst` checks — those prove `injectThinkAnimations` still found `SB-REVEAL-TRIGGER` by name on a text-in-shape object. If they fail, the `objectName` did not survive; inspect the exported XML for `name="SB-REVEAL-TRIGGER"` before changing approach.

- [ ] **Step 9: Verify the click target by hand**

Export one deck from the running app, open it in PowerPoint, run the slideshow, and click the **centre** of the gold pill (on the letters). Expected: the reveal appears. This is the actual bug Nathan reported and the audit cannot prove it.

- [ ] **Step 10: Run the gates and commit**

```bash
npm run check:ui && npm test && npm run audit:deck
git add index.html tools/audit-deck.mjs
git commit -m "fix(deck): make the whole reveal pill clickable, and say what it reveals

The pill and its label were two objects and only the pill carried the click
action, so the text on top swallowed every click that landed on the letters
and just the two edges worked. Drawing it as one text-in-shape object fixes
the hit area. The button now reads 'Click to reveal: the painting's origin'
from a new think.reveal.label field instead of a bare 'Click to reveal'."
```

---

### Task 4: Prompt rules — intention, ignite, timings, register, reflect

Five rule changes in the `generateSpringboard` prompt builder. No contract change, no audit change: prompt quality cannot be unit tested, so this task's verification is generating real decks and reading them.

**Files:**
- Modify: `index.html:2682` (intention), `:2689` (ignite), `:2690` (think steps), `:2698` (reflect)

**Interfaces:**
- Consumes: `think.reveal.label` from Task 3 (already in the prompt)
- Produces: nothing structural

- [ ] **Step 1: Harden the intention rule**

Replace `index.html:2682` (the no-teacher-intention branch) with:

```js
      : `intention: the lesson's learning intention, student-facing, <=18 words, starting "We are learning to". It MUST read as one grammatical sentence after those four words, and name BOTH the thinking move and the content (e.g. "We are learning to describe what we can actually see before we explain what it means"). NEVER restate, quote or lightly reword a curriculum content description, achievement standard, outcome statement or code — the curriculum extract says what the lesson COVERS, the intention says what STUDENTS WILL BE ABLE TO DO, in words a student would use. Measured failure (Year 4, 2026-07-31): "We are learning the effects of contact with other people on First Nations Australians and their Countries/Places following the arrival of the First Fleet and how this was viewed by First Nations Australians as an invasion" — the ACARA descriptor pasted whole, 40 words, and not even grammatical after "We are learning". It must match what the rest of this deck actually asks students to do.`,
```

- [ ] **Step 2: Make the ignite question name the sharing move**

Append to the `ignite.question` rule at `index.html:2689`, before the closing backtick:

```
 It MUST also say what students DO with their answer, including the sharing move: name the choice and then how it goes public ("choose one visible clue and be ready to defend it to the class"). A question that asks students to choose something and then never says to share it leaves the teacher to invent the lesson's most important move.
```

- [ ] **Step 3: Force step timings to agree with the structure line**

Append to the `think.steps` rule at `index.html:2690`, before the closing backtick:

```
 Any duration named inside a step MUST match think.structure, which is printed directly above the steps on the same slide. Measured failure (2026-07-31): a step said "look for 30 seconds" under a structure line reading "Round 1—2 minutes", so the slide contradicted itself. If the structure names rounds, the steps use those rounds' times; if you are unsure, name no time in the step at all.
```

- [ ] **Step 4: Ban gambling register**

Append to the same `think.steps` rule (the final-step sentence about committing) at `index.html:2690`:

```
 Write that commitment in plain classroom language — decide, choose, predict, commit to, make a call. NEVER use gambling words ("bet", "wager", "odds", "what would you put money on"). Measured failure (Year 4, 2026-07-31): "Using your 20 observations, bet: was this painted during the event or long afterwards?".
```

- [ ] **Step 5: Make REFLECT self-contained**

Replace the `reflect.revisit` opening of `index.html:2698` and append the self-containment rule. The rule currently starts `reflect.revisit: <=15 words revisiting the ignite question.` — change to:

```
reflect.revisit: ONE complete question a teacher reads aloud, <=20 words, that sends students back to the ignite question now they know more. It must stand alone as a sentence — colon-compressed shorthand like "Reconsider: beginning or takeover? Use what the painting leaves out." is a failure, because it reads as a note to self rather than something you can say to a class.
```

And append to the end of the same rule:

```
 EVERY reflect prompt must be answerable from what THIS deck actually asked students to do. If a stem refers back to something students made earlier — a headline, a first guess, a ranking, a prediction — that thing must genuinely have been produced in ignite or think. Otherwise pick a reflection routine that does not depend on one. Measured failure (Year 4, 2026-07-31): prompt 1 asked students to write a headline and prompt 2 then asked "the lesson moment that changed my headline was…", when they had never written one at the start, so there was nothing to have changed.
```

- [ ] **Step 6: Run the compile gate**

Run: `npm run check:ui`
Expected: PASS. These are template-literal edits inside JSX-adjacent code and a stray backtick or `${` breaks the whole app silently; this is the only gate that catches it.

- [ ] **Step 7: Generate a real deck and read it**

Open the app, rebuild the same Year 4 First Fleet lesson (the painting stimulus, HASS F-6, Year 4, "Looking: Ten Times Two"), export it, and check all five:

1. The intention is <=18 words, plain student language, grammatical, and is NOT the ACARA descriptor.
2. The ignite question names both the choice and how it is shared with the class.
3. No step names a time that contradicts the "how to run it" line.
4. The word "bet" appears nowhere.
5. Every reflect prompt is answerable from what the lesson actually asked, and `revisit` is a full spoken question.

Any that still fail: strengthen that specific rule and regenerate. Do not move on with a rule that did not take — the whole point of this task is the output, not the prompt text.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(prompt): stop the five wording failures Nathan found in a real Year 4 deck

Each rule now carries the measured failure verbatim as a named anti-example,
which is how this prompt's other rules were hardened.

- intention printed the ACARA content description whole (40 words, and
  ungrammatical after 'We are learning')
- the ignite question asked students to choose a clue and never said to share it
- a step said '30 seconds' directly under a structure line saying two minutes
- the commit step asked Year 4 students to 'bet'
- a reflect prompt asked what changed a headline the lesson never asked for"
```

---

### Task 5: `think.minutes` — the editor field

The timer's duration becomes teacher-owned data on the deck rather than something re-derived from prose at export time.

**Files:**
- Modify: `index.html:2535` (shapeDeck), `:3429-3435` (`thinkMinutes`), THINK editor sections (~5620, ~6350)

**Interfaces:**
- Consumes: nothing
- Produces: `deck.think.minutes` — a number, 1-30. Task 6 reads it. `shapeDeck` falls back to `thinkMinutes(structure)` when it is absent, so decks saved before this change still export.

- [ ] **Step 1: Default it in `shapeDeck`**

At `index.html:2535`, add `minutes` to the `think` object:

```js
    think:   { routine: str(routineName) || str(th.routine), steps: arr(th.steps, 4), structure: str(th.structure), summary: str(th.summary),
               minutes: thinkMinutes(th.minutes != null ? String(th.minutes) + " min" : th.structure),
```

`thinkMinutes` already clamps to 1-30 and defaults to 3, so a missing or junk value cannot produce a broken timer.

- [ ] **Step 2: Move `thinkMinutes` above `shapeDeck`**

`thinkMinutes` is defined at line 3429, below `shapeDeck` at 2520. Both are plain function declarations in one scope so hoisting covers it, but move the function above `shapeDeck` anyway so the dependency reads in order.

- [ ] **Step 3: Add the field to both editor views**

In the THINK section of the two-column editor (near the "How to run it" input, ~line 5620) and the brain-view editor (~line 6350), add a minutes input beside the structure field:

```jsx
<label className="bx-lbl" htmlFor="bx-think-mins">Timer (minutes)</label>
<input id="bx-think-mins" className="bx-input" type="number" min="1" max="30" style={{ width: 90 }}
  value={spot.think.minutes}
  onChange={e => patchDeck(d => { d.think.minutes = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 3)); })} />
```

Match the surrounding patch helper's real name and signature — read the neighbouring `patchNote` / field handlers in that section and follow them rather than assuming `patchDeck` exists.

- [ ] **Step 4: Run the compile gate**

Run: `npm run check:ui`
Expected: PASS.

- [ ] **Step 5: Check it round-trips**

Open the app, generate any lesson, change the timer field to 5, export, and confirm the exported THINK slide's timer reads 5 minutes rather than the routine's default. (Until Task 6 lands this proves only that the value reaches `buildDeckBlob`; assert it by reading `tMins` in the export, or hold this step until Task 6 and note that here.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(editor): let the teacher set the THINK timer length

The timer was derived from the routine's prose at export time with no way to
change it. It is now think.minutes on the deck, defaulted from the structure
line and editable, so a teacher who wants four minutes gets four minutes."
```

---

### Task 6: The digital countdown on the slide

**Build only the variant Task 1's findings file selected.** The steps below are written for the `full` verdict; if the verdict was `reduced` or `coarse`, change only the `PRESETS` array and the `MAXSEC`/step size accordingly. If it was `bar`, skip the countdown stack entirely and instead move the existing drain bar to the bottom-right and give each preset button its own `sbWipeOutEffect` with that preset's duration.

**Files:**
- Modify: `index.html:3364-3376` (new marker + effect helper), `:3378-3427` (`injectThinkAnimations`), `:4772-4787` (timer rendering)
- Modify: `tools/audit-deck.mjs:235` (timer assertion)

**Interfaces:**
- Consumes: `deck.think.minutes` (Task 5)
- Produces: nothing later tasks depend on

- [ ] **Step 1: Rewrite the failing timer assertion**

Replace `tools/audit-deck.mjs:235`:

```js
  check(cfg.id, "timer always on THINK", /\d:\d\d/.test(joined), "missing digital clock");
  check(cfg.id, "timer presets on THINK", /\b1 min\b/.test(joined) && /\b3 min\b/.test(joined), "missing preset buttons");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run audit:deck`
Expected: FAIL on both — the slide still carries `2 MIN` / `CLICK TO START` and no presets.

- [ ] **Step 3: Add the markers and the delayed-appear helper**

After `index.html:3366`, add:

```js
const SB_CLOCK_MARK = "SB-CLOCK";           // objectName is "SB-CLOCK::<secondsRemaining>"
const SB_TIMERBTN_MARK = "SB-TIMERBTN";     // objectName is "SB-TIMERBTN::<totalSeconds>"
```

After the `sbAppearEffect` helper at line 3373, add its delayed twin:

```js
// Appear at a fixed delay from the trigger click. Same shape as sbAppearEffect, but every clock
// label needs its own offset: the label for T seconds remaining appears (total - T) seconds in.
const sbAppearAtEffect = (id, spid, ms) =>
  `<p:par><p:cTn id="${id}" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="afterEffect"><p:stCondLst><p:cond delay="${ms}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${id + 1}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par>`;
```

- [ ] **Step 4: Draw the clock and presets bottom-right**

Replace `index.html:4772-4787` (the `tMins` / drain-bar block) with:

```js
        // Digital countdown, bottom-right, away from the routine steps and the reveal pill.
        // A shared stack of MM:SS labels serves every preset: clicking a preset reveals its own
        // labels one per second, each covering the last, which is what makes the digits change.
        // The animation is spliced in by injectThinkAnimations (PptxGenJS cannot write one).
        const tMins = (deck.think && deck.think.minutes) || thinkMinutes(structure);
        if (structure) s.addText([{ text: "How to run it:  ", options: { bold: true, color: INK } }, { text: structure, options: { color: INK } }],
          { x: 0.7, y: 1.9, w: colW, h: 0.5, fontSize: fitFontSize("How to run it:  " + structure, colW, 0.3, 14, 10), valign: "top", fontFace: FONT });
        const TIMER_PRESETS = [1, 2, 3, 5];
        const clockX = W - 2.1, clockY = H - 1.15, clockW = 1.5, clockH = 0.5;
        const mmss = sec => Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
        TIMER_PRESETS.forEach((mins, i) => {
          s.addText(mins + " min", {
            shape: pptx.ShapeType.roundRect, rectRadius: 0.1, fill: { color: "EDE4D2" },
            x: +(clockX - 3.15 + i * 0.78).toFixed(2), y: clockY, w: 0.72, h: clockH,
            fontSize: 10, bold: true, color: INK, align: "center", valign: "middle", fontFace: FONT,
            objectName: SB_TIMERBTN_MARK + "::" + (mins * 60),
          });
        });
        // Resting label: what the clock shows before anyone clicks. Not animated, drawn first so
        // every animated label sits above it.
        s.addText(mmss(tMins * 60), { x: clockX, y: clockY, w: clockW, h: clockH, fontSize: 22, bold: true, color: GOLD_INK, align: "center", valign: "middle", fontFace: FONT });
        // Descending, so 0:00 is drawn last and therefore sits on top of every other label.
        const maxSec = Math.max(...TIMER_PRESETS) * 60;
        for (let sec = maxSec; sec >= 0; sec--) {
          s.addText(mmss(sec), {
            x: clockX, y: clockY, w: clockW, h: clockH, fill: { color: WHITE },
            fontSize: 22, bold: true, color: GOLD_INK, align: "center", valign: "middle", fontFace: FONT,
            objectName: SB_CLOCK_MARK + "::" + sec,
          });
        }
```

`runW` and `timerW` disappear with the old block — "How to run it" gets the full column width back, which is why its `w` becomes `colW` above.

- [ ] **Step 5: Splice the countdown timing**

In `injectThinkAnimations`, replace the `if (bar && bar.arg)` block at `index.html:3397-3402`. `idOf` matches one name at a time, so add a helper that finds every clock label and every preset button:

```js
    const allOf = (name) => [...xml.matchAll(new RegExp('<p:cNvPr id="(\\d+)" name="' + name + '::(\\d+)"', "g"))]
      .map(m => ({ spid: m[1], arg: +m[2] }));
    const clocks = new Map(allOf(SB_CLOCK_MARK).map(c => [c.arg, c.spid]));
    for (const btn of allOf(SB_TIMERBTN_MARK)) {
      const effects = [];
      for (let t = btn.arg; t >= 0; t--) {
        const spid = clocks.get(t);
        if (!spid) continue;
        effects.push(sbAppearAtEffect(nextId + 3 + (btn.arg - t) * 2, spid, (btn.arg - t) * 1000));
        builds.push(`<p:bldP spid="${spid}" grpId="0"/>`);
      }
      seqs.push(sbInteractiveSeq(nextId, btn.spid, effects.join("")));
      nextId += 3 + (btn.arg + 1) * 2 + 1;
    }
```

`builds` will contain the same `bldP` many times over (one per preset that uses that label). Deduplicate before writing, or PowerPoint sees repeated build entries — change the two `builds.join("")` calls at lines 3414-3417 to `[...new Set(builds)].join("")`.

Also update the guard at line 3384 and the name-cleanup at lines 3421-3423:

```js
    if (xml.indexOf(SB_CLOCK_MARK) === -1 && xml.indexOf(SB_REVEAL_TRIGGER) === -1) continue;
```

```js
    xml = xml.replace(new RegExp('name="' + SB_CLOCK_MARK + '::\\d+"', "g"), 'name="Lesson timer"')
             .replace(new RegExp('name="' + SB_TIMERBTN_MARK + '::\\d+"', "g"), 'name="Timer preset"')
             .replace(new RegExp('name="' + SB_REVEAL_TRIGGER + '"'), 'name="Reveal button"')
             .replace(new RegExp('name="' + SB_REVEAL_BODY + '"'), 'name="Reveal"');
```

Delete `SB_TIMER_MARK`, `sbWipeOutEffect` and the old `bar` lookup once nothing references them.

- [ ] **Step 6: Update the teacher note**

At `index.html:4849`, replace the TIMER line:

```js
          + "\n\nTIMER: the clock sits bottom-right. Click a preset (1, 2, 3 or 5 min) to start that countdown — you can change it mid-lesson.");
```

- [ ] **Step 7: Run the audit**

Run: `npm run audit:deck`
Expected: PASS, including `timing ids unique`, `animation targets exist`, `every animated shape is in bldLst` and `all shapes inside the slide`. That last one matters — `clockX = W - 2.1` and the preset row extending 3.15 inches left of it must stay on the slide.

- [ ] **Step 8: Open a real export in PowerPoint**

Export a deck from the running app and confirm: opens without a repair prompt, the clock reads the editor's minutes at rest, clicking a preset counts down, and an ordinary click still advances the slide rather than starting the timer.

- [ ] **Step 9: Run all gates and commit**

```bash
npm run check:ui && npm test && npm run audit
git add index.html tools/audit-deck.mjs
git commit -m "feat(deck): digital countdown timer, bottom-right and changeable

The old timer was a gold bar top-right that drained over whatever duration
the routine's prose happened to name, fixed at export. It is now an MM:SS
clock bottom-right with 1/2/3/5 min preset buttons, so timing can change
mid-lesson without leaving the slideshow, and it reads think.minutes so the
teacher's own setting wins."
```

---

### Task 7: Intention length hint in the editor (optional)

Nathan flagged this as droppable. The app cannot reword a teacher's own intention, but it can mention when one looks like curriculum text. **Skip this task if he said no.**

**Files:**
- Modify: `index.html` near the intention textarea (~line 5475)

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Add the hint**

Under the intention textarea at `index.html:5475`, add:

```jsx
{(() => {
  const words = intention.trim().split(/\s+/).filter(Boolean).length;
  const looksCurricular = /\bAC9[A-Z0-9]*\b|\bVCE\b|achievement standard|content description/i.test(intention);
  if (!intention.trim() || (words <= 20 && !looksCurricular)) return null;
  return <p className="bx-hint">This goes on the slide students read. {words > 20 ? `It is ${words} words — under 18 reads better.` : ""} {looksCurricular ? "It looks like curriculum wording; students respond better to plain language." : ""}</p>;
})()}
```

Reuse an existing muted-text class rather than inventing `bx-hint` if one already exists in that section — check the neighbouring markup first.

- [ ] **Step 2: Run the compile gate**

Run: `npm run check:ui`
Expected: PASS.

- [ ] **Step 3: Check it by hand**

Paste the 40-word ACARA descriptor from the spec into the intention box. Expected: the hint appears. Type a short plain intention. Expected: no hint.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(editor): flag an intention that reads like curriculum text

The app returns a teacher's own intention verbatim, which is right, but that
is how a 40-word ACARA descriptor ended up on a Year 4 slide. It cannot
reword it, so it mentions it."
```

---

### Task 8: Verify the whole thing against the original failure

**Files:** none modified unless a check fails

- [ ] **Step 1: Run every gate**

Run: `npm test && npm run check:ui && npm run audit`
Expected: all pass. Quote the actual assertion totals — do not claim a pass without the output in front of you.

- [ ] **Step 2: Rebuild the exact lesson that failed**

Same stimulus (the First Fleet flag-raising painting), same class (HASS F-6, Year 4), same routine (Looking: Ten Times Two). Export it.

- [ ] **Step 3: Check all eight success criteria from the spec**

1. No content advisory slide.
2. Intention <=18 words, plain, grammatical, not the curriculum descriptor.
3. Ignite question names the choice AND the class discussion.
4. No step timing contradicts the "how to run it" line.
5. No gambling vocabulary anywhere.
6. Reveal button names what it reveals and responds to a click on the letters.
7. Every reflect prompt is answerable from what the lesson actually asked.
8. Timer is bottom-right, shows MM:SS, changeable in the editor and in the slideshow.

Any that fail go back to their task. Criteria 2-5 and 7 are prompt-dependent, so one bad generation is not proof of failure — regenerate twice before concluding a rule did not take, and say so if it is intermittent.

- [ ] **Step 4: Bump the version and commit**

Bump `APP_VERSION` in `index.html` (~line 676), then:

```bash
git add index.html
git commit -m "chore: bump APP_VERSION for the deck quality fixes"
git push
```

- [ ] **Step 5: Confirm the deploy**

GitHub Pages serves the repo root and updates on push; no `api/` files changed, so no Vercel deploy is needed. Confirm the footer on the live site shows the new `APP_VERSION` before telling Nathan it is done.

---

## Self-Review

**Spec coverage.** All nine spec findings map to tasks: advisory → Task 2; intention → Task 4 step 1 (+ optional Task 7); ignite discussion → Task 4 step 2; step timings → Task 4 step 3; "bet" → Task 4 step 4; reveal label → Task 3; reveal click bug → Task 3; reflect coherence → Task 4 step 5; timer → Tasks 1, 5, 6. Contract changes (drop `advisory`, add `think.reveal.label`, add `think.minutes`) are each carried by the task that introduces them. Testing and success criteria are Task 8.

**Type consistency.** `think.reveal.label` is a string everywhere (Task 3 steps 4-6, Task 8). `think.minutes` is a number 1-30 in Task 5 and consumed as one in Task 6 step 4. `SB_CLOCK_MARK` / `SB_TIMERBTN_MARK` use the same `NAME::arg` convention as the existing `SB_TIMER_MARK`, which `idOf`/`allOf` both parse.

**Known risk.** Task 6 step 5 changes `builds` from an array with unique entries to one with duplicates; the dedupe is called out explicitly because `tools/audit-deck.mjs:213` asserts on `bldLst` contents and would otherwise pass while PowerPoint saw repeated build entries.
