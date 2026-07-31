/* Springboard deck audit: drives the REAL app headless for several lesson shapes, exports each
   .pptx, unpacks it in-page with the JSZip the app already loads, and asserts structural invariants
   on the actual slide XML. Usage: node audit-deck.mjs <index.html> */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));

const CHROME = "C:\\Users\\BennN\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const APP = process.argv[2] || path.join(HERE, "..", "index.html");
const SCRATCH = path.join(process.env.TEMP || HERE, "sb-audit");
fs.mkdirSync(SCRATCH, { recursive: true });
const EMU_W = 12192000, EMU_H = 6858000;   // 13.333 x 7.5 inches
const results = [];
const check = (cfg, name, ok, detail) => results.push({ cfg, name, ok: !!ok, detail: ok ? "" : String(detail || "") });

const baseDeck = (over = {}) => ({
  title: "One Tree, Many Stories",
  intention: "We are learning to describe what we can see before we explain it",
  keywords: ["land use", "change"],
  ignite: { question: "What is this tree still doing here?" },
  think: {
    routine: "See, Think, Wonder",
    steps: ["Name what you can see.", "What do you think is going on?", "Commit to a year: when was this taken?"],
    structure: "Think-pair-share, 3 min", summary: "",
    reveal: { fact: "This tree was photographed in 2019, and the woodland around it was cleared in 1957.", question: "What does that change about how old you thought it was?", label: "when it was taken" },
  },
  launch: { connection: "AC9E7LE03 - explore how texts represent place.", bridge: "From one tree to how we write about place.", question: "How does a writer make a place matter?", ideas: ["Rank three descriptions.", "Quick-write from the tree's view.", "Debate: survivor or leftover?"] },
  reflect: { revisit: "Back to our first question.", prompts: ["I used to think...", "Now I think...", "Next time I will..."], metacognition: "Name the strategy you used to notice detail." },
  next: [
    { title: "Map the missing woodland", idea: "Students map what used to grow around the tree, then compare with an aerial photo and mark what is gone.", thinking: "Parts, purposes, complexities - seeing systems." },
    { title: "Interview the paddock", idea: "Students write and record a short interview with the tree, using evidence from the photo for every answer.", thinking: "Perspective taking - another point of view." },
    { title: "Argue for one tree", idea: "Students take a side on whether the last paddock tree should be protected, backed with two pieces of evidence.", thinking: "Reasoning with evidence - building a case." },
  ],
  notes: { ignite: "FACILITATION: Show it cold. TIMING: 3 min.", think: "FACILITATION: Pairs first.", launch: "FACILITATION: Use one idea.", reflect: "FACILITATION: Exit ticket." },
  ...over,
});

const LONG = "A single old paddock tree stands alone in a cleared field, and the woodland that once surrounded it was pulled out for grazing decades ago, leaving nothing to replace it when it finally falls. ";
const CONFIGS = [
  { id: "article-full", mode: "article", deck: baseDeck(), reflect: true },
  // Still sends advisory{flag:true}: a deck saved before the advisory was removed, or a model that
  // keeps emitting the old field, must NOT resurrect the slide. Dropping the field from the fixture
  // would make the "no content advisory" assertion below pass without proving anything.
  { id: "media-reflect", mode: "media", reflect: true,
    deck: baseDeck({ advisory: { flag: true, reason: "This lesson touches on land clearing and loss." } }) },
  { id: "article-noreveal-noreflect", mode: "article", reflect: false,
    deck: (() => { const d = baseDeck(); d.think.reveal = { fact: "", question: "" }; d.think.summary = LONG.repeat(2); return d; })() },
  { id: "stress-long-text", mode: "media", reflect: true,
    deck: (() => {
      const d = baseDeck();
      d.title = "Who Is Standing Just Outside the Frame of This Painting, and Why Were They Left Out";
      d.think.steps = [LONG.slice(0, 150), LONG.slice(0, 160), LONG.slice(0, 170), LONG.slice(0, 180)];
      d.think.structure = "Small groups of four, two timed rounds of 6 min";
      d.think.reveal = { fact: LONG.slice(0, 190), question: "What does that change about who you thought this was made for and why?", label: "who made it" };
      d.reflect.prompts = [LONG.slice(0, 90), LONG.slice(0, 95), LONG.slice(0, 100), LONG.slice(0, 105)];
      d.ignite.question = "Is this man raising the flag or pulling it down, and what would you bet on it?";
      return d;
    })() },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runConfig(cfg, port) {
  const stub = `
window.__errs = [];
window.addEventListener("error", e => window.__errs.push(String(e.message)));
window.addEventListener("unhandledrejection", e => window.__errs.push("rej: " + String(e.reason)));
const ANALYSE = {summary:"A single tree in a cleared field.",routines:[
  {name:"See, Think, Wonder",why:"Slows students down."},{name:"Claim, Support, Question",why:"Backs a claim."},{name:"Circle of Viewpoints",why:"Opens up stakes."}]};
const DECK = ${JSON.stringify(cfg.deck)};
const realFetch = window.fetch;
window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("/api/generate")) {
    const body = (opts && opts.body) || "";
    return new Response(JSON.stringify({choices:[{message:{content: JSON.stringify(body.includes('"routines"') ? ANALYSE : DECK)}}]}), {status:200, headers:{"Content-Type":"application/json"}});
  }
  if (u.includes("/api/")) return new Response("{}", {status:200, headers:{"Content-Type":"application/json"}});
  return realFetch(url, opts);
};
window.__pptx = null;
const realCOU = URL.createObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  try { if (blob && blob.size > 5000) { window.__blob = blob; } } catch (e) {}
  return realCOU(blob);
};
`;
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--allow-file-access-from-files", "--force-device-scale-factor=1", "--window-size=1280,900",
    `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(SCRATCH, "cdp-audit-" + cfg.id)}`, "about:blank"], { stdio: "ignore" });
  let ws, id = 0; const pending = new Map();
  const send = (method, params = {}) => { const mid = ++id; ws.send(JSON.stringify({ id: mid, method, params })); return new Promise((res, rej) => pending.set(mid, { res, rej })); };
  const evaluate = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("eval threw: " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  try {
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === "page"); if (t) break; } catch {} await sleep(250); }
    ws = new WebSocket(t.webSocketDebuggerUrl);
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
    await new Promise(r => { ws.onopen = r; });
    await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: stub });
    await send("Page.navigate", { url: "file:///" + APP.replace(/\\/g, "/") });
    // Everything here is polled, never slept: in-browser Babel takes 6s on a warm machine and much
    // longer under memory pressure, and a fixed sleep turns that into a phantom "element missing".
    const waitFor = async (jsTest, label, tries = 40) => {
      for (let i = 0; i < tries; i++) { if (await evaluate(jsTest)) return true; await sleep(500); }
      throw new Error("timed out waiting for " + label);
    };
    await waitFor(`!!document.querySelector(".ww-enter")`, "the cover");
    await evaluate(`document.querySelector(".ww-enter").click()`);
    await waitFor(`document.querySelectorAll(".ww-label,.ww-maplist-row").length > 0`, "the understanding map");
    await evaluate(`(()=>{const b=[...document.querySelectorAll(".ww-label,.ww-maplist-row")].find(x=>/Describe What/.test(x.textContent||"")); if(b) b.click();})()`);
    await waitFor(`!!document.querySelector("#bx-tool .bx-modes")`, "the move chamber");
    await evaluate(`(()=>{const setSel=(el,v)=>{const p=Object.getOwnPropertyDescriptor(el.constructor.prototype,"value").set;p.call(el,v);el.dispatchEvent(new Event("change",{bubbles:true}));};
      for(const s of document.querySelectorAll("#bx-tool select")){const o=[...s.options].find(o=>/^Year 7$/.test(o.text)); if(o){setSel(s,o.value);}}})()`);
    await sleep(1200);
    await evaluate(`(()=>{const setSel=(el,v)=>{const p=Object.getOwnPropertyDescriptor(el.constructor.prototype,"value").set;p.call(el,v);el.dispatchEvent(new Event("change",{bubbles:true}));};
      for(const s of document.querySelectorAll("#bx-tool select")){const o=[...s.options].find(o=>/english/i.test(o.text)); if(o){setSel(s,o.value); break;}}})()`);
    await sleep(1200);
    if (cfg.mode === "media") {
      const doc = await send("DOM.getDocument", {});
      const nodeId = (await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: '#bx-tool input[type=file]' })).nodeId;
      await send("DOM.setFileInputFiles", { nodeId, files: [path.join(path.dirname(APP), "assets", "brain", "bloom-olive.jpg")] });
      await sleep(2500);
    } else {
      // The tab is the one in .bx-modes labelled exactly "Article" — matching /text/ instead grabs
      // the "Fetch text" button and the stimulus never lands.
      const tab = await evaluate(`(()=>{const b=[...document.querySelectorAll(".bx-modes button")].find(x=>/^article$/i.test((x.textContent||"").trim())); if(b){b.click(); return "clicked";} return "MISSING";})()`);
      if (tab !== "clicked") throw new Error("could not find the Article tab");
      await sleep(900);
      const filled = await evaluate(`(()=>{const set=(el,v)=>{const p=Object.getOwnPropertyDescriptor(el.constructor.prototype,"value").set;p.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));};
        const ta=[...document.querySelectorAll("#bx-tool textarea")].find(x=>x.id!=="bx-intention"); if(!ta) return "MISSING"; set(ta, ${JSON.stringify(LONG.repeat(4))}); return ta.value.length;})()`);
      if (filled === "MISSING") throw new Error("no article textarea");
      await sleep(900);
    }
    await waitFor(`(()=>{const b=[...document.querySelectorAll("#bx-tool button")].find(x=>/suggest routines/i.test(x.textContent||"")); return !!b && !b.disabled;})()`, "the Suggest routines button to enable");
    await evaluate(`(()=>{const b=[...document.querySelectorAll("#bx-tool button")].find(x=>/suggest routines/i.test(x.textContent||"")); b.click();})()`);
    await waitFor(`document.querySelectorAll(".bx-routine").length > 0`, "routine suggestions");
    await evaluate(`document.querySelectorAll(".bx-routine")[0].click()`);
    await waitFor(`(()=>{const b=[...document.querySelectorAll("#bx-tool button")].find(x=>/make the lesson/i.test(x.textContent||"")); return !!b && !b.disabled;})()`, "the Make the lesson button");
    await evaluate(`(()=>{const b=[...document.querySelectorAll("#bx-tool button")].find(x=>/make the lesson/i.test(x.textContent||"")); b.click();})()`);
    await waitFor(`!!document.querySelector(".bx-edit-wrap")`, "the lesson editor");
    if (!cfg.reflect) {
      await evaluate(`(()=>{const l=[...document.querySelectorAll("label")].find(x=>/Include the REFLECT slide/i.test(x.textContent||"")); const cb=l&&l.querySelector("input[type=checkbox]"); if(cb&&cb.checked) cb.click(); return !!cb;})()`);
      await sleep(600);
    }
    await evaluate(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/download|powerpoint|\\.pptx/i.test(x.textContent||"")); if(b&&!b.disabled) b.click();})()`);
    for (let i = 0; i < 60; i++) { if (await evaluate(`!!window.__blob`)) break; await sleep(1000); }
    const errs = await evaluate(`window.__errs`);
    if (!(await evaluate(`!!window.__blob`))) {
      const uiErr = await evaluate(`[...document.querySelectorAll(".bx-alert")].map(e=>e.textContent).join(" | ") || "(no visible error)"`);
      const btn = await evaluate(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/download|powerpoint|\\.pptx/i.test(x.textContent||"")); return b ? b.textContent.trim()+(b.disabled?" [disabled]":" [enabled]") : "(no download button)";})()`);
      throw new Error(`no .pptx produced — app says: ${uiErr}; button: ${btn}; js errors: ${JSON.stringify(errs)}`);
    }
    // Unpack the .pptx in-page with the JSZip the app already loaded.
    const slides = await evaluate(`(async () => {
      const zip = await JSZip.loadAsync(window.__blob);
      const out = {};
      for (const p of Object.keys(zip.files)) {
        if (/^ppt\\/(slides|notesSlides)\\/[a-zA-Z]+\\d+\\.xml$/.test(p) || /_rels\\/slide\\d+\\.xml\\.rels$/.test(p)) out[p] = await zip.file(p).async("string");
      }
      return JSON.stringify(out);
    })()`);
    return { errs, files: JSON.parse(slides) };
  } finally { try { ws && ws.close(); } catch {} chrome.kill(); }
}

/* ---------------- assertions over one exported deck ---------------- */
function auditDeck(cfg, data) {
  const { errs, files } = data;
  check(cfg.id, "no runtime errors while building", errs.length === 0, JSON.stringify(errs));
  const slideNames = Object.keys(files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => +a.match(/(\d+)/)[1] - +b.match(/(\d+)/)[1]);
  const n = slideNames.length;
  check(cfg.id, "deck has slides", n >= 5, `${n}`);
  const xmlOf = (i) => files[`ppt/slides/slide${i}.xml`];
  const relOf = (i) => files[`ppt/slides/_rels/slide${i}.xml.rels`] || "";
  const textOf = (x) => [...x.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join(" ");
  const hidden = (x) => /show="0"/.test(x);

  let visible = 0, hiddenCount = 0;
  for (let i = 1; i <= n; i++) {
    const x = xmlOf(i);
    const label = `slide ${i}`;
    hidden(x) ? hiddenCount++ : visible++;
    // 1. no placeholder junk on any slide
    check(cfg.id, `${label}: no undefined/NaN text`, !/\b(undefined|NaN|\[object Object\])\b/.test(textOf(x)), textOf(x).slice(0, 80));
    check(cfg.id, `${label}: no empty text run`, !/<a:t><\/a:t>/.test(x.replace(/<a:t> <\/a:t>/g, "")), "empty run");
    // 2. every shape sits inside the slide
    const frames = [...x.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)]
      .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
    const outside = frames.filter(f => f.x < -1000 || f.y < -1000 || f.x + f.w > EMU_W + 1000 || f.y + f.h > EMU_H + 1000);
    check(cfg.id, `${label}: all shapes inside the slide`, outside.length === 0, JSON.stringify(outside.slice(0, 2)));
    // 3. internal jumps resolve to a real slide
    const jumps = [...relOf(i).matchAll(/Target="slide(\d+)\.xml"/g)].map(m => +m[1]);
    check(cfg.id, `${label}: slide links resolve`, jumps.every(j => j >= 1 && j <= n), JSON.stringify(jumps));
    // 4. animation timing is internally consistent
    if (/<p:timing>/.test(x)) {
      const ids = [...x.matchAll(/<p:cTn id="(\d+)"/g)].map(m => +m[1]);
      check(cfg.id, `${label}: timing ids unique`, new Set(ids).size === ids.length, JSON.stringify(ids));
      const spids = [...x.matchAll(/<p:spTgt spid="(\d+)"\/>/g)].map(m => m[1]);
      const shapeIds = new Set([...x.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1]));
      check(cfg.id, `${label}: animation targets exist`, spids.every(s => shapeIds.has(s)), JSON.stringify(spids.filter(s => !shapeIds.has(s))));
      check(cfg.id, `${label}: one timing block only`, (x.match(/<p:timing>/g) || []).length === 1, "duplicate timing");
      // bldLst lists shapes that ANIMATE. A trigger shape appears in spTgt (inside stCondLst) but is
      // never animated itself, and PowerPoint's own output leaves it out of bldLst — so only count
      // spids targeted by an actual behaviour (<p:set>, <p:animEffect>).
      const animated = [...new Set([...x.matchAll(/<p:(?:set|animEffect)\b[\s\S]{0,400}?<p:spTgt spid="(\d+)"\/>/g)].map(m => m[1]))];
      check(cfg.id, `${label}: every animated shape is in bldLst`,
        animated.every(s => x.includes(`<p:bldP spid="${s}"`)), "missing bldP for " + animated.filter(s => !x.includes(`<p:bldP spid="${s}"`)).join(","));
    }
    // 5. notes
    const notes = files[`ppt/notesSlides/notesSlide${i}.xml`];
    if (!hidden(x)) check(cfg.id, `${label}: visible slide carries teacher notes`, !!notes && textOf(notes).trim().length > 20, "thin notes");
  }
  check(cfg.id, "hidden teacher slides exist", hiddenCount >= 3, `${hiddenCount}`);
  check(cfg.id, "student-facing slides are visible", visible >= 2, `${visible}`);

  // 6. deck shape per config
  const allText = slideNames.map((_, i) => textOf(xmlOf(i + 1)));
  const joined = allText.join(" || ");
  check(cfg.id, "IGNITE present", /IGNITE/.test(joined), "missing");
  check(cfg.id, "THINK present", /THINK/.test(joined), "missing");
  check(cfg.id, "teacher preface present", /BEFORE YOU TEACH/i.test(joined), "missing");
  check(cfg.id, "where-to-next divider present", /Where this thinking goes next/i.test(joined), "missing");
  check(cfg.id, "three follow-up slides", (joined.match(/IDEA \d OF 3/gi) || []).length === 3, "wrong count");
  check(cfg.id, "REFLECT matches the teacher's choice", /REFLECT/.test(joined) === !!cfg.reflect, `expected ${cfg.reflect}`);
  check(cfg.id, "no content advisory slide is ever produced", !/CONTENT ADVISORY/.test(joined), "advisory slide still rendered");
  const wantReveal = !!cfg.deck.think.reveal.fact;
  check(cfg.id, "reveal button matches the deck", /Click to reveal/.test(joined) === wantReveal, `expected ${wantReveal}`);
  if (wantReveal) {
    // The pill and its label used to be two objects and only the pill carried the click action, so
    // the text on top swallowed every click that landed on the letters and just the two edges
    // worked (Nathan, 2026-07-31). The clickable object must BE the one holding the text.
    const thinkXml = slideNames.map((_, i) => xmlOf(i + 1)).find(x => /Click to reveal/.test(textOf(x))) || "";
    const pillSp = thinkXml.split("<p:sp>").find(c => c.includes("Click to reveal"));
    check(cfg.id, "reveal pill is one shape carrying its own text", !!pillSp && /prst="roundRect"/.test(pillSp), "the label is a separate object from the clickable shape");
    check(cfg.id, "the clickable object is the one with the label on it", !!pillSp && /name="Reveal button"/.test(pillSp), "click action is on a different object from the text");
    const lbl = cfg.deck.think.reveal.label;
    check(cfg.id, "reveal button names what it reveals", !lbl || joined.includes("Click to reveal: " + lbl), `expected the label "${lbl}"`);
  }
  check(cfg.id, "timer always on THINK", /CLICK TO START/.test(joined), "missing timer");
  // 7. footer numbering
  const pages = [...joined.matchAll(/(\d+) \/ (\d+)/g)].map(m => [+m[1], +m[2]]);
  check(cfg.id, "footer numbers run 1..total", pages.length > 0 && pages.every(([a, b], i) => a === i + 1 && b === pages[0][1]), JSON.stringify(pages));
  check(cfg.id, "footer total equals student slides", pages.length === 0 || pages[0][1] === pages.length, `${pages.length} numbered, total says ${pages[0] && pages[0][1]}`);
  // 8. zoom slides return to the slide they came from
  for (let i = 1; i <= n; i++) {
    const x = xmlOf(i);
    if (!/Click anywhere to go back/.test(textOf(x))) continue;
    const back = [...new Set([...relOf(i).matchAll(/Target="slide(\d+)\.xml"/g)].map(m => +m[1]))];
    check(cfg.id, `zoom slide ${i} has exactly one back target`, back.length === 1, JSON.stringify(back));
    const src = back[0];
    const linksHere = [...relOf(src).matchAll(/Target="slide(\d+)\.xml"/g)].map(m => +m[1]);
    check(cfg.id, `zoom slide ${i} is reachable from slide ${src}`, linksHere.includes(i), JSON.stringify(linksHere));
    check(cfg.id, `zoom slide ${i} is hidden`, hidden(x), "visible");
  }
  // 9. brand: every run names a font, colours stay in the palette
  const fonts = [...new Set([...slideNames.map((_, i) => xmlOf(i + 1)).join("").matchAll(/typeface="([^"]+)"/g)].map(m => m[1]))];
  check(cfg.id, "one brand font family only", fonts.length <= 2, JSON.stringify(fonts));
  // Read the palette from the app itself rather than hardcoding it here: the deck builder's own
  // colour constants ARE the brand, so the check stays true when a shade is retuned.
  const src = fs.readFileSync(APP, "utf8");
  const bStart = src.indexOf("async function buildDeckBlob");
  const bEnd = src.indexOf("return await stampDocProps", bStart);
  const wStart = src.indexOf("const WESLEY = {");
  const brandSrc = src.slice(wStart, src.indexOf("};", wStart)) + src.slice(bStart, bEnd);
  const PALETTE = new Set([...brandSrc.matchAll(/"([0-9A-Fa-f]{6})"/g)].map(m => m[1].toUpperCase()));
  const colours = [...new Set([...slideNames.map((_, i) => xmlOf(i + 1)).join("").matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)].map(m => m[1].toUpperCase()))];
  const offPalette = colours.filter(c => !PALETTE.has(c));
  check(cfg.id, "colours stay in the Wesley palette", offPalette.length === 0, JSON.stringify(offPalette));
}

/* ---------------- run every config ---------------- */
let port = 9400;
for (const cfg of CONFIGS) {
  process.stdout.write(`running ${cfg.id}… `);
  try {
    const data = await runConfig(cfg, port++);
    auditDeck(cfg, data);
    console.log("done");
  } catch (e) {
    check(cfg.id, "config ran to completion", false, e.message);
    console.log("FAILED: " + e.message);
  }
}

const byCfg = {};
for (const r of results) {
  byCfg[r.cfg] = byCfg[r.cfg] || { pass: 0, fail: 0, fails: [] };
  r.ok ? byCfg[r.cfg].pass++ : (byCfg[r.cfg].fail++, byCfg[r.cfg].fails.push(r.name + (r.detail ? " :: " + r.detail : "")));
}
let total = 0, passed = 0;
console.log("\n=== DECK AUDIT ===");
for (const [cfg, v] of Object.entries(byCfg)) {
  total += v.pass + v.fail; passed += v.pass;
  console.log(`${cfg.padEnd(28)} ${String(v.pass).padStart(4)}/${String(v.pass + v.fail).padEnd(4)} ${v.fail ? "FAIL " + v.fail : "ok"}`);
  for (const f of v.fails.slice(0, 10)) console.log("      - " + f);
  if (v.fails.length > 10) console.log(`      ... and ${v.fails.length - 10} more`);
}
console.log(`TOTAL ${passed}/${total} (${(passed / total * 100).toFixed(1)}%)`);
fs.writeFileSync(path.join(SCRATCH, "audit-deck.json"), JSON.stringify({ total, passed, byCfg }, null, 1));
