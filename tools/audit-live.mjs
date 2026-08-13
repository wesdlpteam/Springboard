/* Springboard LIVE matrix test.
   Loads the real index.html in headless Chrome, points its API calls at the deployed backend, and
   drives the REAL client functions (analyseStimulus -> generateSpringboard) for every year level
   Foundation-12 across a spread of subjects and image / video / article stimulus.
   Writes one JSON per run into out/ so nothing is lost if a later run dies. */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIGS, ARTICLE_MATCH } from "./audit-live-configs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Users\\BennN\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const ROOT = path.join(HERE, "..");
const WORK = path.join(ROOT, ".audit-live");
// Serve the app on one of the backend's allowed CORS origins (api/_lib.js ALLOWED_ORIGINS). A
// file:// page sends Origin: null and every API call dies with "Failed to fetch". 3000 rather
// than 5500 because VS Code's Live Server usually holds 5500.
const ORIGIN = "http://localhost:3000";
const LIVE = "https://springboard-dlp-s-projects.vercel.app";
const PACK = JSON.parse(fs.readFileSync(path.join(WORK, "stimuli", "manifest.json"), "utf8"));
// OUT names a folder UNDER .audit-live, so a comparison run can land beside the baseline
// instead of overwriting 30 lessons that cost real money to generate. A bare name only: no
// separators, no traversal, so this can never write outside the audit workspace.
const OUT_NAME = process.env.OUT || "out";
if (!/^[A-Za-z0-9._-]+$/.test(OUT_NAME) || OUT_NAME === "." || OUT_NAME === "..") {
  console.error(`OUT must be a simple folder name under .audit-live (got "${OUT_NAME}")`);
  process.exit(1);
}
const OUT = path.join(WORK, OUT_NAME);
fs.mkdirSync(OUT, { recursive: true });
// Lets a run price and judge a different reasoning effort without anyone hand-editing
// GEN_REASONING in index.html and forgetting to put it back. Unset = whatever ships.
const REASONING = process.env.SB_REASONING || "";
if (REASONING && !["low", "medium", "high"].includes(REASONING)) {
  console.error(`SB_REASONING must be low, medium or high (got "${REASONING}")`);
  process.exit(1);
}
console.log(`[audit-live] writing to .audit-live/${OUT_NAME}${REASONING ? ` at reasoning_effort=${REASONING}` : ""}`);
const WORKERS = Number(process.env.WORKERS || 3);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* Static server on the allowed origin: repo root, plus /stim/* for the stimulus pack. */
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

/* Resolve each config's stimulus to a concrete local file / article text. */
function resolveStim(cfg) {
  if (cfg.kind === "article") {
    const re = ARTICLE_MATCH[cfg.stim];
    const hit = PACK.articles.find(a => re && (re.test(a.title) || re.test(a.url)));
    if (!hit) throw new Error("no article in pack for " + cfg.stim);
    return { kind: "article", title: hit.title, url: hit.url, text: hit.text };
  }
  const pool = cfg.kind === "video" ? PACK.videos : PACK.images;
  const hit = pool.find(x => x.key === cfg.stim);
  if (!hit) throw new Error("no " + cfg.kind + " in pack for " + cfg.stim);
  return { kind: cfg.kind, file: hit.file.replace(/\\/g, "/"), title: hit.title, page: hit.page, bytes: hit.bytes };
}

/* Injected before the app loads: send every API call to the deployed backend instead of the
   file:// build's localhost default, and record what actually went over the wire. */
const BOOT = `
${REASONING ? `window.__sbReasoning = ${JSON.stringify(REASONING)};` : ""}
window.__errs = [];
window.addEventListener("error", e => window.__errs.push(String(e.message)));
window.addEventListener("unhandledrejection", e => window.__errs.push("rej: " + String(e.reason)));
window.__calls = [];
const _f = window.fetch;
window.fetch = (input, init) => {
  let url = typeof input === "string" ? input : (input && input.url) || "";
  if (url.startsWith("http://localhost:3000")) {
    url = ${JSON.stringify(LIVE)} + url.slice("http://localhost:3000".length);
    window.__calls.push(url.replace(${JSON.stringify(LIVE)}, ""));
    return _f(url, init);
  }
  return _f(input, init);
};
// Stimulus files come off the same local server, so the app's own fetch shim must not touch them.
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

/* ---------------- CDP plumbing ---------------- */
async function openBrowser(port, tag) {
  const dir = path.join(process.env.TEMP, "sb-live-" + tag);
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
  return { send, evaluate, close: () => { try { ws.close(); } catch {} chrome.kill(); } };
}

/* ---------------- one config end to end ---------------- */
async function runOne(page, cfg) {
  const t0 = Date.now();
  const stim = resolveStim(cfg);
  const classInfo = { curriculum: cfg.cur, subject: cfg.subject, yearLevel: cfg.year, outcome: cfg.outcome || "", focus: [] };

  // Teacher-ticked curriculum focus items exercise /api/guide and the classInfo.focus path.
  let focusPicked = [];
  if (cfg.focus || cfg.focusCodes?.length) {
    focusPicked = await page.evaluate(`(async () => {
      const ci = ${JSON.stringify(classInfo)};
      const g = (typeof vceStudyGuide === "function" && vceStudyGuide(ci)) || acStudyGuide(ci);
      if (!g) return [];
      const r = await fetch(API_BASE + "/api/guide", { method: "POST", headers: { "Content-Type": "application/json", "x-sb-passcode": "" }, body: JSON.stringify(g) });
      const d = await r.json();
      const items = (d.groups || []).flatMap(x => x.items || []).map(i => i.text);
      const wanted = ${JSON.stringify(cfg.focusCodes || [])};
      if (wanted.length) return wanted.map(code => items.find(item => item.startsWith(code + " "))).filter(Boolean);
      return items.slice(0, ${Number(cfg.focus) || 0});
    })()`);
    classInfo.focus = focusPicked || [];
    if (cfg.focusCodes?.length && classInfo.focus.length !== cfg.focusCodes.length)
      throw new Error(`could not resolve configured focus codes: ${cfg.focusCodes.join(", ")}`);
  }

  // Build the media reel exactly the way the upload path does. The reel stays in the page —
  // data URLs and video frames are megabytes each and must never round-trip through CDP.
  let mediaExpr = "(window.__media = [], [])", mode = "article", sourceText = "";
  if (stim.kind === "article") { sourceText = stim.text; }
  else if (stim.kind === "image") {
    mode = "media";
    mediaExpr = `(async () => {
      const blob = await window.__localBlob(${JSON.stringify(ORIGIN + "/stim/" + path.basename(stim.file))}, "image/jpeg");
      const dataUrl = await window.__toDataUrl(blob);
      const smallUrl = await downscaleDataUrl(dataUrl);
      window.__media = [{ id: "m1", kind: "image", dataUrl, smallUrl, name: ${JSON.stringify(path.basename(stim.file))}, aspect: 1.5 }];
      return [{ kind: "image", bytes: blob.size, dataUrlLen: dataUrl.length, smallUrlLen: smallUrl.length }];
    })()`;
  } else {
    mode = "media";
    mediaExpr = `(async () => {
      const blob = await window.__localBlob(${JSON.stringify(ORIGIN + "/stim/" + path.basename(stim.file))}, "video/webm");
      const file = new File([blob], ${JSON.stringify(path.basename(stim.file))}, { type: "video/webm" });
      const { frames, poster, width, height } = await extractVideoFrames(file, 4);
      let text = "", tState = "done";
      try { const tr = await transcribeMedia({ passcode: "", file }); text = tr.text || ""; }
      catch (e) { tState = "failed: " + (e && e.message || e); }
      window.__media = [{ id: "m1", kind: "video", dataUrl: "", name: file.name, sizeBytes: file.size, poster,
                aspect: width && height ? width / height : 0, frames, text, transcribeState: tState }];
      return [{ kind: "video", bytes: file.size, frames: frames.length, transcript: text.length, transcribeState: tState, sample: text.slice(0, 300) }];
    })()`;
  }

  const mediaMeta = await page.evaluate(mediaExpr, 300000);

  // Step 1 — the app's own analyse call (band-filtered routine menu, scoped to the Thinking Move).
  const analyse = await page.evaluate(`(async () => {
    const move = MOVES.find(m => m.name === ${JSON.stringify(cfg.move)}) || null;
    return await analyseStimulus({ passcode: "", mode: ${JSON.stringify(mode)}, media: window.__media,
      sourceText: ${JSON.stringify(sourceText)}, classInfo: ${JSON.stringify(classInfo)}, move });
  })()`, 180000);

  const routineName = analyse.routines[0].name;

  // Step 2 — the real generate.
  const gen = await page.evaluate(`(async () => {
    const r = await generateSpringboard({ passcode: "", mode: ${JSON.stringify(mode)}, media: window.__media,
      sourceText: ${JSON.stringify(sourceText)}, classInfo: ${JSON.stringify(classInfo)},
      routineName: ${JSON.stringify(routineName)},
      reflectRoutine: ${JSON.stringify(cfg.reflectRoutine || "")},
      intention: ${JSON.stringify(cfg.intention || "")} });
    return { parsed: r.parsed, rawLen: r.raw.length };
  })()`, 240000);
  const buildSeconds = Math.round((Date.now() - t0) / 1000);

  // Run the app's own non-blocking verifier against exactly the stimulus representation generation saw.
  const revealFact = gen.parsed?.think?.reveal?.fact || "";
  let revealCheck = null;
  if (String(revealFact).trim()) {
    revealCheck = await page.evaluate(`(async () => {
      try {
        const result = await verifyRevealFact({ passcode: "", mode: ${JSON.stringify(mode)}, media: window.__media,
          sourceText: ${JSON.stringify(sourceText)}, fact: ${JSON.stringify(revealFact)} });
        return result ? { verdict: result.verdict, reason: result.reason || "" } : null;
      } catch (_) { return null; }
    })()`, 180000);
  }

  const errs = await page.evaluate(`window.__errs.slice()`);
  const calls = await page.evaluate(`window.__calls.splice(0)`);
  return {
    id: cfg.id, cfg, stim: { kind: stim.kind, title: stim.title, url: stim.url || stim.page, bytes: stim.bytes },
    classInfo, focusPicked, mediaMeta, analyse, routineName, deck: gen.parsed,
    rawLen: gen.rawLen, revealCheck, calls, errs, seconds: buildSeconds,
  };
}

/* ---------------- drive the matrix ---------------- */
const queue = CONFIGS.filter(c => !ONLY || ONLY.includes(c.id));
let next = 0;
const done = [];

async function worker(n) {
  const port = 9500 + n;
  let page = null;
  try {
    page = await openBrowser(port, "w" + n);
    for (;;) {
      const i = next++;
      if (i >= queue.length) break;
      const cfg = queue[i];
      const dest = path.join(OUT, cfg.id + ".json");
      if (fs.existsSync(dest) && !process.env.FORCE) { log(`skip ${cfg.id} (already done)`); done.push(cfg.id); continue; }
      try {
        log(`run  ${cfg.id} [w${n}]`);
        const res = await runOne(page, cfg);
        fs.writeFileSync(dest, JSON.stringify(res, null, 2));
        // A recovered lesson supersedes its old failure record; keeping both makes the report
        // count a successful rerun as failed without changing whether the lesson resumes.
        fs.rmSync(path.join(OUT, cfg.id + ".ERROR.json"), { force: true });
        log(`ok   ${cfg.id} ${res.seconds}s routine="${res.routineName}"`);
        done.push(cfg.id);
      } catch (e) {
        log(`FAIL ${cfg.id}: ${e.message}`);
        fs.writeFileSync(path.join(OUT, cfg.id + ".ERROR.json"), JSON.stringify({ id: cfg.id, cfg, error: String(e.message) }, null, 2));
      }
    }
  } finally { page && page.close(); }
}

log(`matrix: ${queue.length} lessons, ${WORKERS} browsers`);
await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
log(`finished: ${done.length}/${queue.length} ok`);
server.close();
process.exit(0);
