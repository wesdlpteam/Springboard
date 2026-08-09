/* Springboard ROUTINE sweep: one live lesson per thinking routine (all 93), each pinned
   directly (no analyse step), against the deployed backend. Youngest band the routine
   supports, band-appropriate class + stimulus. Writes one JSON per routine into
   .audit-live/out-routines/ plus a human digest (routine-sweep-digest.md) comparing the
   generated THINK steps against the routine's canonical steps.
   Resume-safe like audit-live.mjs: existing JSONs are skipped unless FORCE=1. ONLY=names
   (comma-separated slugs) runs a subset. Run AFTER audit-live.mjs — both bind :3000. */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Users\\BennN\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const ROOT = path.join(HERE, "..");
const WORK = path.join(ROOT, ".audit-live");
const ORIGIN = "http://localhost:3000";
const LIVE = "https://springboard-dlp-s-projects.vercel.app";
const PACK = JSON.parse(fs.readFileSync(path.join(WORK, "stimuli", "manifest.json"), "utf8"));
const OUT = path.join(WORK, "out-routines");
fs.mkdirSync(OUT, { recursive: true });
const WORKERS = Number(process.env.WORKERS || 4);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Same static server as audit-live.mjs (repo root + /stim/*). */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webm": "video/webm", ".ogv": "video/ogg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = url.startsWith("/stim/") ? path.join(WORK, "stimuli", url.slice(6))
             : path.join(ROOT, url === "/" ? "index.html" : url.replace(/^\//, ""));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end("nope"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
});
await new Promise(r => server.listen(3000, "127.0.0.1", r));

const BOOT = `
window.__errs = [];
window.addEventListener("error", e => window.__errs.push(String(e.message)));
window.addEventListener("unhandledrejection", e => window.__errs.push("rej: " + String(e.reason)));
const _f = window.fetch;
window.fetch = (input, init) => {
  let url = typeof input === "string" ? input : (input && input.url) || "";
  if (url.startsWith("http://localhost:3000")) {
    url = ${JSON.stringify(LIVE)} + url.slice("http://localhost:3000".length);
    return _f(url, init);
  }
  return _f(input, init);
};
window.__localBlob = (url, type) => new Promise((res, rej) => {
  const x = new XMLHttpRequest();
  x.open("GET", url); x.responseType = "blob";
  x.onload = () => res(type ? new Blob([x.response], { type }) : x.response);
  x.onerror = () => rej(new Error("could not read " + url));
  x.send();
});
window.__toDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob);
});
`;

async function openBrowser(port, tag) {
  const dir = path.join(process.env.TEMP, "sb-sweep-" + tag);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--autoplay-policy=no-user-gesture-required",
    "--force-device-scale-factor=1", "--window-size=1280,900",
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60; i++) {
    try { t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === "page"); if (t) break; } catch {}
    await sleep(250);
  }
  if (!t) { chrome.kill(); throw new Error("chrome never came up on " + port); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("ws failed")); });
  const send = (method, params = {}) => { const mid = ++id; ws.send(JSON.stringify({ id: mid, method, params })); return new Promise((res, rej) => pending.set(mid, { res, rej })); };
  const evaluate = async (expr, ms = 240000) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: ms });
    if (r.exceptionDetails) throw new Error("page: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || "").split("\n")[0]);
    return r.result.value;
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: BOOT });
  await send("Page.navigate", { url: ORIGIN + "/index.html" });
  for (let i = 0; i < 120; i++) { if (await evaluate(`typeof generateSpringboard === "function" && typeof ROUTINES !== "undefined"`)) break; await sleep(500); }
  if (!(await evaluate(`typeof generateSpringboard === "function"`))) { chrome.kill(); throw new Error("app never booted"); }
  return { evaluate, close: () => { try { ws.close(); } catch {} chrome.kill(); } };
}

/* -------- band -> class + stimulus. Youngest band a routine supports is the hardest
   language case, so that is the one each routine is generated at. -------- */
const BAND_ORDER = ["early", "junior", "middle", "senior"];
// A few routines only make sense on a text or on sound; everything else gets an image.
const ARTICLE_ROUTINES = new Set(["Word-Phrase-Sentence", "The 4 Cs", "Red Light, Yellow Light",
  "Facts or Fiction", "Stop, Look, Listen", "Take Note"]);
const VIDEO_ROUTINES = new Set(["Listening: Ten Times Two"]);
const IMAGE_BY_BAND = {
  early:  { year: "F",  subject: "English",           stim: "market-stall" },
  junior: { year: "4",  subject: "HASS (F\u20136)",   stim: "bridge-build" },
  middle: { year: "8",  subject: "Geography (7\u201310)", stim: "plastic-beach" },
  senior: { year: "10", subject: "Science",           stim: "earth-apollo" },
};
const ARTICLE_BY_BAND = {
  early:  { year: "2",  subject: "Health and Physical Education", match: /10,?000 steps/i },
  junior: { year: "4",  subject: "HASS (F\u20136)",   match: /pocket money|chores/i },
  middle: { year: "8",  subject: "English",           match: /political cartoons/i },
  senior: { year: "10", subject: "English",           match: /political cartoons/i },
};
const VIDEO_BY_BAND = {
  early:  { year: "F",  subject: "Music", stim: "dance" },
  junior: { year: "4",  subject: "Music", stim: "dance" },
  middle: { year: "8",  subject: "Music", stim: "dance" },
  senior: { year: "10", subject: "Music", stim: "dance" },
};

function jobFor(r) {
  const band = BAND_ORDER.find(b => r.bands.includes(b)) || "senior";
  let kind = "image", pick;
  if (VIDEO_ROUTINES.has(r.name)) { kind = "video"; pick = VIDEO_BY_BAND[band]; }
  else if (ARTICLE_ROUTINES.has(r.name)) { kind = "article"; pick = ARTICLE_BY_BAND[band]; }
  else pick = IMAGE_BY_BAND[band];
  return { routine: r, band, kind, ...pick };
}

/* -------- checks on one generated deck (subset of audit-live-report's FAIL set,
   plus per-routine shape signals where the routine names its own numbers/artefacts) -------- */
const GENERIC_STEP = /^(look (closely|carefully) at the (image|picture|video|text)|discuss with your (partner|group)|share your (ideas|thoughts) with the class|think about what you see)[.!?]?$/i;
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const NOTE_ORDER = /FACILITATION:[\s\S]*ENABLING PROMPT:[\s\S]*EXTENDING PROMPT:[\s\S]*CURRICULUM LINKS:/;
// Early-band decks legitimately translate the routine's own nouns into five-year-old words
// ("news title" for headline, "picture" for image) — measured 2026-08-09, so the signals
// accept the plain-words versions alongside the canonical ones.
const SHAPE_SIGNALS = {
  "Looking: Ten Times Two":   [/\b(ten|10)\b/i],
  "Listening: Ten Times Two": [/\b(ten|10)\b/i, /listen|hear|sound/i],
  "Headlines":                [/headline|news title/i],
  "Color, Symbol, Image":     [/colou?r/i, /symbol/i, /image|picture/i],
  "Word-Phrase-Sentence":     [/word/i, /phrase/i, /sentence/i],
  "3-2-1 Bridge":             [/\b(3|three)\b/i, /\b(2|two)\b/i, /\b(1|one)\b/i],
  "Compass Points":           [/excit/i, /worr/i, /need/i],
  "The 4 Cs":                 [/connect/i, /challeng/i, /concept/i, /change/i],
};
const REFLECT_SIGNALS = {
  "I Used to Think\u2026 / Now I Think\u2026": [/used to think/i, /now i think/i],
  "Connect\u2013Extend\u2013Challenge": [/connect|link to what/i, /extend|pushed my thinking|changed my thinking/i, /challeng|still puzzl/i],
  "3-2-1 Bridge": [/\b(3|three)\b/i, /\b(1|one)\b/i],
  "Headlines": [/headline/i],
  "Reflect\u2013Connect\u2013Project": [/connect/i, /next|forward|use/i],
  "Compass Points": [/excit/i, /worr/i],
  "Color, Symbol, Image": [/colou?r/i, /symbol/i],
  "Think About Your Thinking (Task \u00b7 Strategy \u00b7 Self)": [/strateg/i, /yourself|self/i],
};

function checkDeck(job, deck, reflectPin) {
  const c = [];
  const fail = (cat, msg) => c.push({ level: "FAIL", cat, msg });
  const warn = (cat, msg) => c.push({ level: "WARN", cat, msg });
  if (!deck || typeof deck !== "object") { fail("schema", "no parsed deck"); return c; }
  if (deck.think?.routine !== job.routine.name) fail("routine", `think.routine "${deck.think?.routine}" != pinned "${job.routine.name}"`);
  const steps = deck.think?.steps || [];
  if (!steps.length || steps.length > 4) fail("limits", `think.steps ${steps.length} (want 1-4)`);
  steps.forEach((s, i) => {
    if (words(s) < 6) fail("pedagogy", `step ${i + 1} is a fragment: "${s}"`);
    if (GENERIC_STEP.test(s)) fail("pedagogy", `step ${i + 1} is generic: "${s}"`);
  });
  const joined = steps.join(" ");
  for (const re of SHAPE_SIGNALS[job.routine.name] || [])
    if (!re.test(joined)) fail("fidelity", `steps never carry the routine's own shape ${re}: ${JSON.stringify(steps)}`);
  const rev = deck.think?.reveal || {};
  if (String(rev.fact || "").trim()) {
    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const fw = norm(rev.fact);
    for (let i = 0; i + 5 <= fw.length; i++) {
      const gram = fw.slice(i, i + 5).join(" ");
      if (steps.some(s => norm(s).join(" ").includes(gram))) { fail("pedagogy", `reveal spoiled: step prints "${gram}"`); break; }
    }
    if (!String(rev.question || "").trim()) fail("schema", "reveal has a fact but no question");
  }
  if ((deck.launch?.ideas || []).length !== 3) fail("schema", `launch.ideas ${(deck.launch?.ideas || []).length} (want 3)`);
  if ((deck.next || []).length !== 3) fail("schema", `next ${(deck.next || []).length} (want 3)`);
  for (const k of ["ignite", "think", "launch", "reflect"])
    if (!NOTE_ORDER.test(String(deck.notes?.[k] || ""))) fail("notes", `notes.${k} missing the four labelled sections in order`);
  if (reflectPin) {
    const j = (deck.reflect?.prompts || []).join(" ");
    const sig = REFLECT_SIGNALS[reflectPin] || [];
    const hit = sig.filter(re => re.test(j)).length;
    if (sig.length && hit < Math.ceil(sig.length / 2)) fail("reflect", `pinned "${reflectPin}" not honoured: ${JSON.stringify(deck.reflect?.prompts)}`);
  }
  return c;
}

/* ---------------- run ---------------- */
const boot = await (async () => {
  const p = await openBrowser(9600, "meta");
  const routines = await p.evaluate(`ROUTINES.map(r => ({ name: r.name, bands: r.bands, steps: r.steps, gist: r.gist, structure: r.structure, group: r.group, url: r.url }))`);
  const reflects = await p.evaluate(`REFLECT_ROUTINES.map(r => r.name)`);
  p.close();
  return { routines, reflects };
})();
log(`sweeping ${boot.routines.length} routines`);

const jobs = boot.routines.map(jobFor);
// Spread the 8 pinnable reflect routines across the sweep so each is honoured-checked once.
boot.reflects.forEach((name, i) => { const j = jobs[i * 11]; if (j) j.reflectPin = name; });

let next = 0;
async function worker(n) {
  const port = 9601 + n;
  let page = null;
  try {
    page = await openBrowser(port, "w" + n);
    for (;;) {
      const i = next++;
      if (i >= jobs.length) break;
      const job = jobs[i];
      const file = path.join(OUT, slug(job.routine.name) + ".json");
      if (fs.existsSync(file) && !process.env.FORCE) { log(`skip ${job.routine.name}`); continue; }
      if (ONLY && !ONLY.includes(slug(job.routine.name))) continue;
      const t0 = Date.now();
      try {
        const classInfo = { curriculum: "Australian Curriculum", subject: job.subject, yearLevel: job.year, outcome: "", focus: [] };
        let mode = "article", sourceText = "", mediaExpr = `(window.__media = [], [])`;
        if (job.kind === "article") {
          const hit = PACK.articles.find(a => job.match.test(a.title));
          if (!hit) throw new Error("no article matches " + job.match);
          sourceText = hit.text; job.stimTitle = hit.title;
        } else if (job.kind === "image") {
          mode = "media";
          const hit = PACK.images.find(x => x.key === job.stim);
          job.stimTitle = hit.title;
          mediaExpr = `(async () => {
            const blob = await window.__localBlob(${JSON.stringify(ORIGIN + "/stim/" + path.basename(hit.file.replace(/\\/g, "/")))}, "image/jpeg");
            const dataUrl = await window.__toDataUrl(blob);
            const smallUrl = await downscaleDataUrl(dataUrl);
            window.__media = [{ id: "m1", kind: "image", dataUrl, smallUrl, name: "stim.jpg", aspect: 1.5 }];
            return [1];
          })()`;
        } else {
          mode = "media";
          const hit = PACK.videos.find(x => x.key === job.stim);
          job.stimTitle = hit.title;
          mediaExpr = `(async () => {
            const blob = await window.__localBlob(${JSON.stringify(ORIGIN + "/stim/" + path.basename(hit.file.replace(/\\/g, "/")))}, "video/webm");
            const file = new File([blob], "stim.webm", { type: "video/webm" });
            const { frames, poster, width, height } = await extractVideoFrames(file, 4);
            let text = "";
            try { const tr = await transcribeMedia({ passcode: "", file }); text = tr.text || ""; } catch {}
            window.__media = [{ id: "m1", kind: "video", dataUrl: "", name: file.name, sizeBytes: file.size, poster,
                      aspect: width && height ? width / height : 0, frames, text, transcribeState: "done" }];
            return [1];
          })()`;
        }
        await page.evaluate(mediaExpr, 300000);
        const gen = await page.evaluate(`(async () => {
          const r = await generateSpringboard({ passcode: "", mode: ${JSON.stringify(mode)}, media: window.__media,
            sourceText: ${JSON.stringify(sourceText)}, classInfo: ${JSON.stringify(classInfo)},
            routineName: ${JSON.stringify(job.routine.name)},
            reflectRoutine: ${JSON.stringify(job.reflectPin || "")}, intention: "" });
          return { parsed: r.parsed, rawLen: r.raw.length };
        })()`, 240000);
        const checks = checkDeck(job, gen.parsed, job.reflectPin);
        const res = { routine: job.routine, band: job.band, kind: job.kind, year: job.year, subject: job.subject,
          stimTitle: job.stimTitle, reflectPin: job.reflectPin || "", classInfo, deck: gen.parsed,
          rawLen: gen.rawLen, checks, seconds: Math.round((Date.now() - t0) / 1000) };
        fs.writeFileSync(file, JSON.stringify(res, null, 2));
        const fails = checks.filter(x => x.level === "FAIL").length;
        log(`ok   ${job.routine.name} ${res.seconds}s ${fails ? fails + " FAIL" : "clean"}`);
      } catch (e) {
        log(`FAIL ${job.routine.name}: ${e.message}`);
        fs.writeFileSync(path.join(OUT, slug(job.routine.name) + ".ERROR.json"),
          JSON.stringify({ routine: job.routine.name, error: String(e.message) }, null, 2));
      }
    }
  } finally { page && page.close(); }
}

await Promise.all(Array.from({ length: WORKERS }, (_, n) => worker(n)));
server.close();

/* ---------------- digest ---------------- */
const files = fs.readdirSync(OUT).filter(f => f.endsWith(".json") && !f.endsWith(".ERROR.json"));
const runs = files.map(f => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")));
runs.sort((a, b) => a.routine.name.localeCompare(b.routine.name));
const L = [`# Routine sweep digest — ${runs.length} routines, ${new Date().toISOString().slice(0, 10)}`, ""];
let totalFails = 0;
for (const r of runs) {
  const fails = (r.checks || []).filter(c => c.level === "FAIL");
  totalFails += fails.length;
  L.push(`## ${r.routine.name} — ${r.band} (Year ${r.year} ${r.subject}, ${r.kind})${r.reflectPin ? ` [reflect pinned: ${r.reflectPin}]` : ""}`);
  L.push(`Canonical: ${r.routine.steps.join(" | ")}`);
  L.push(`Structure: ${r.deck?.think?.structure || "—"}`);
  L.push(`Ignite: ${r.deck?.ignite?.question || "—"}`);
  (r.deck?.think?.steps || []).forEach((s, i) => L.push(`  ${i + 1}. ${s}`));
  if (r.deck?.think?.reveal?.fact) L.push(`Reveal: ${r.deck.think.reveal.fact} -> ${r.deck.think.reveal.question}`);
  for (const c of r.checks || []) L.push(`  ${c.level} [${c.cat}] ${c.msg}`);
  L.push("");
}
const errors = fs.readdirSync(OUT).filter(f => f.endsWith(".ERROR.json"));
L.push(`---`, `${runs.length} generated, ${errors.length} errored, ${totalFails} mechanical FAILs.`);
if (errors.length) errors.forEach(f => L.push(`ERROR: ${f}`));
fs.writeFileSync(path.join(WORK, "routine-sweep-digest.md"), L.join("\n"));
log(`digest written: ${runs.length} ok, ${errors.length} errors, ${totalFails} FAILs`);
