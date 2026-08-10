/* Springboard UI audit: drives the real pages headless at four window shapes, sweeping each scene
   for accessibility, contrast, overflow and console errors. Usage: node audit-ui.mjs <index.html> */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));

const CHROME = "C:\\Users\\BennN\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const APP = process.argv[2] || path.join(HERE, "..", "index.html");
const DIR = path.dirname(APP);
const SCRATCH = path.join(process.env.TEMP || HERE, "sb-audit");
fs.mkdirSync(SCRATCH, { recursive: true });
const results = [];
const check = (ctx, name, ok, detail) => results.push({ ctx, name, ok: !!ok, detail: ok ? "" : String(detail || "") });

// The production loader's fast path requires same-origin fetch, so serve the real files over
// loopback. file:// is retained nowhere here because it deliberately exercises Babel fallback.
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".ttf": "font/ttf", ".m4a": "audio/mp4", ".mp4": "video/mp4",
};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname); }
  catch { res.writeHead(400).end("Bad request"); return; }
  const target = pathname === "/" || pathname === "/index.html"
    ? APP : path.resolve(DIR, pathname.replace(/^\/+/, ""));
  const relative = path.relative(DIR, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) { res.writeHead(403).end("Forbidden"); return; }
  fs.readFile(target, (err, body) => {
    if (err) { res.writeHead(err.code === "ENOENT" ? 404 : 500).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  });
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// Nathan's own screen is wide-short (~1163x560 CSS, 1080p at 165% DPI) — it must be in the set.
const VIEWPORTS = [
  { id: "nathan-1163x560", w: 1163, h: 560 },
  { id: "wide-1908x924", w: 1908, h: 924 },
  { id: "square-1024x768", w: 1024, h: 768 },
  { id: "phone-390x844", w: 390, h: 844 },
];

/* In-page sweep: returns findings as data so Node does the asserting. */
const SWEEP = `(() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
  const name = el => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") ||
    el.getAttribute("alt") || "").trim();
  // Chrome hands back both rgb()/rgba() (0-255) and color(srgb r g b / a) (0-1). Reading the second
  // as if it were 0-255 makes a near-white panel look black, which is how a perfectly legible note
  // first showed up as a 2.26:1 failure. Parse both, and composite alpha over what is behind.
  const parse = (c) => {
    if (!c) return null;
    if (/^color\\(srgb/.test(c)) { const m = c.match(/[\\d.]+/g).map(Number);
      return { r: m[0]*255, g: m[1]*255, b: m[2]*255, a: m.length > 3 ? m[3] : 1 }; }
    const m = (c.match(/[\\d.]+/g) || []).map(Number);
    if (m.length < 3) return null;
    return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
  };
  const over = (fg, bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });
  const lum = (col) => { if (!col) return null;
    const f = v => { v = v/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(col.r) + 0.7152*f(col.g) + 0.0722*f(col.b); };
  const bgOf = (el) => {
    let acc = { r: 255, g: 255, b: 255, a: 0 }, layers = [], n = el;
    while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } n = n.parentElement; }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor) || { r:255,g:255,b:255,a:1 };
    let base = root.a >= 1 ? root : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const ratio = (fgStr, bgCol) => { const fg = parse(fgStr); if (!fg || !bgCol) return null;
    const a = lum(fg.a < 1 ? over(fg, bgCol) : fg), b = lum(bgCol); if (a == null || b == null) return null;
    const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

  const out = { buttons: [], controls: [], images: [], contrast: [], overflow: null, h1: 0, live: 0, alerts: 0, small: [] };
  out.overflow = { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
  out.h1 = document.querySelectorAll("h1").length;
  out.live = document.querySelectorAll("[aria-live]").length;
  out.alerts = document.querySelectorAll('[role="alert"]').length;
  for (const b of document.querySelectorAll("button, a[href]")) {
    if (!vis(b)) continue;
    const r = b.getBoundingClientRect();
    out.buttons.push({ name: name(b).slice(0, 40), tag: b.tagName, h: Math.round(r.height), w: Math.round(r.width) });
    // WCAG 2.2 target size (2.5.8) exempts links sitting inside a sentence, so only standalone
    // controls are held to 24px.
    const inline = b.tagName === "A" && b.parentElement &&
      (b.parentElement.textContent || "").trim().length > (b.textContent || "").trim().length + 4;
    if (r.height < 24 && name(b) && !inline) out.small.push(name(b).slice(0, 30) + " " + Math.round(r.height) + "px");
  }
  for (const c of document.querySelectorAll("input, textarea, select")) {
    if (!vis(c)) continue;
    const id = c.id;
    const labelled = !!(c.getAttribute("aria-label") || (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) || c.closest("label"));
    out.controls.push({ id: id || "(no id)", type: c.type || c.tagName, labelled });
  }
  for (const im of document.querySelectorAll("img")) {
    if (!vis(im)) continue;
    out.images.push({ src: (im.getAttribute("src") || "").slice(0, 40), alt: im.getAttribute("alt"), hidden: im.getAttribute("aria-hidden") === "true" });
  }
  const sample = [...document.querySelectorAll("p, h1, h2, h3, label, .bx-note, .bx-lab, button, a, small, li, span")].filter(vis).slice(0, 90);
  for (const el of sample) {
    // Judge only the text this element paints itself; a child span may set its own colour, and
    // attributing the parent's colour to it invents failures that aren't on screen.
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
    if (t.length < 4) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize) || 16;
    const bold = (+cs.fontWeight >= 700);
    const r = ratio(cs.color, bgOf(el));
    if (r == null) continue;
    const large = px >= 24 || (px >= 18.66 && bold);
    out.contrast.push({ text: t.slice(0, 32), px: Math.round(px), ratio: +r.toFixed(2), need: large ? 3 : 4.5 });
  }
  return JSON.stringify(out);
})()`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withBrowser(vp, fn) {
  const port = 9500 + (vp.w % 400);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--allow-file-access-from-files", "--force-device-scale-factor=1", `--window-size=${vp.w},${vp.h}`,
    `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(SCRATCH, "cdp-ui-" + vp.id)}`, "about:blank"], { stdio: "ignore" });
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
    const consoleErrs = [], consoleWarns = [], eventHandlers = new Map();
    const onEvent = (method, handler) => {
      const list = eventHandlers.get(method) || [];
      list.push(handler); eventHandlers.set(method, list);
    };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.method === "Runtime.exceptionThrown") consoleErrs.push(String(m.params?.exceptionDetails?.exception?.description || "").slice(0, 120));
      // Babel-standalone shouts "[BABEL] Note: ... exceeds the max of 500KB" down console.error
      // once index.html passes half a megabyte. It is an informational note about ITS OWN output
      // formatting, not a fault in the page, and it fired on every scene at once — six identical
      // failures that say nothing about the UI. Anything else on console.error still counts.
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        const text = String(m.params.args?.[0]?.value || "").slice(0, 120);
        if (!/^\[BABEL\] Note:/.test(text)) consoleErrs.push(text);
      }
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "warning") {
        consoleWarns.push(m.params.args?.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 240) || "warning");
      }
      for (const handler of eventHandlers.get(m.method) || []) { try { handler(m.params); } catch {} }
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    };
    await new Promise(r => { ws.onopen = r; });
    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 500 });
    return await fn({ evaluate, send, consoleErrs, consoleWarns, onEvent });
  } finally { try { ws && ws.close(); } catch {} chrome.kill(); }
}

function assertSweep(ctx, s) {
  check(ctx, "no page-level horizontal scroll", s.overflow.scrollW <= s.overflow.innerW + 2, `${s.overflow.scrollW} > ${s.overflow.innerW}`);
  check(ctx, "exactly one h1", s.h1 === 1, `${s.h1}`);
  const unnamed = s.buttons.filter(b => !b.name);
  check(ctx, "every button and link has an accessible name", unnamed.length === 0, JSON.stringify(unnamed.slice(0, 3)));
  const unlabelled = s.controls.filter(c => !c.labelled);
  check(ctx, "every visible form control is labelled", unlabelled.length === 0, JSON.stringify(unlabelled.slice(0, 3)));
  const badImg = s.images.filter(i => i.alt === null && !i.hidden);
  check(ctx, "every image has alt text or is marked decorative", badImg.length === 0, JSON.stringify(badImg.slice(0, 3)));
  check(ctx, "no tiny tap targets", s.small.length === 0, JSON.stringify(s.small.slice(0, 4)));
  const lowContrast = s.contrast.filter(c => c.ratio < c.need);
  check(ctx, "text meets WCAG AA contrast", lowContrast.length === 0,
    JSON.stringify(lowContrast.slice(0, 4).map(c => `"${c.text}" ${c.ratio}:1 needs ${c.need}`)));
}

/* ---------------- run ---------------- */
for (const vp of VIEWPORTS) {
  process.stdout.write(`sweeping ${vp.id}… `);
  try {
    await withBrowser(vp, async ({ evaluate, send, consoleErrs, consoleWarns }) => {
      const waitFor = async (js, label, tries = 40) => {
        for (let i = 0; i < tries; i++) { if (await evaluate(js)) return true; await sleep(500); }
        throw new Error("timed out waiting for " + label);
      };
      // --- scene 1: cover
      await send("Page.navigate", { url: ORIGIN + "/index.html" });
      await waitFor(`!!document.querySelector(".ww-enter")`, "cover");
      assertSweep(`${vp.id}/cover`, JSON.parse(await evaluate(SWEEP)));
      const fallbackWarns = consoleWarns.filter(w => /Springboard app precompile fallback/.test(w));
      check(`${vp.id}/cover`, "precompiled app uses the fast path", fallbackWarns.length === 0, fallbackWarns.join(" | "));
      check(`${vp.id}/cover`, "no console errors", consoleErrs.length === 0, consoleErrs.slice(0, 2).join(" | "));
      // --- scene 2: understanding map
      await evaluate(`document.querySelector(".ww-enter").click()`);
      await waitFor(`document.querySelectorAll(".ww-label,.ww-maplist-row").length > 0`, "map");
      await sleep(1200);
      assertSweep(`${vp.id}/map`, JSON.parse(await evaluate(SWEEP)));
      check(`${vp.id}/map`, "all eight thinking moves are reachable",
        (await evaluate(`new Set([...document.querySelectorAll(".ww-label,.ww-maplist-row")].map(e=>e.textContent.trim())).size`)) >= 8, "fewer than 8");
      // --- scene 3: the move chamber
      await evaluate(`(()=>{const b=[...document.querySelectorAll(".ww-label,.ww-maplist-row")].find(x=>/Describe What/.test(x.textContent||"")); b.click();})()`);
      await waitFor(`!!document.querySelector("#bx-tool .bx-modes")`, "chamber");
      await sleep(1000);
      assertSweep(`${vp.id}/chamber`, JSON.parse(await evaluate(SWEEP)));
      check(`${vp.id}/chamber`, "the back link does not sit under the masthead",
        await evaluate(`(()=>{const b=document.querySelector(".bx-back"); const m=document.querySelector("header,.ww-masthead,.masthead");
          if(!b) return true; const br=b.getBoundingClientRect(); const mr=m?m.getBoundingClientRect():{bottom:0};
          return br.top >= mr.bottom - 2;})()`), "overlapped");
      check(`${vp.id}/chamber`, "no console errors", consoleErrs.length === 0, consoleErrs.slice(0, 2).join(" | "));
      // --- scene 4: about page
      await send("Page.navigate", { url: ORIGIN + "/about.html" });
      await waitFor(`!!document.querySelector("h1")`, "about page");
      await sleep(1200);
      assertSweep(`${vp.id}/about`, JSON.parse(await evaluate(SWEEP)));
      check(`${vp.id}/about`, "no console errors", consoleErrs.length === 0, consoleErrs.slice(0, 2).join(" | "));
    });
    console.log("done");
  } catch (e) {
    check(vp.id, "sweep ran to completion", false, e.message);
    console.log("FAILED: " + e.message);
  }
}

// One blocked compiled-script request proves the pinned-SRI Babel path is a live escape hatch.
process.stdout.write("checking loader fallback… ");
try {
  await withBrowser({ id: "loader-fallback", w: 1024, h: 768 }, async ({ evaluate, send, consoleWarns, onEvent }) => {
    onEvent("Fetch.requestPaused", params => {
      if (/\/assets\/app\.js(?:\?|$)/.test(params.request?.url || "")) {
        send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
      } else {
        send("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});
      }
    });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*assets/app.js*", requestStage: "Request" }] });
    await send("Page.navigate", { url: ORIGIN + "/index.html" });
    let booted = false;
    for (let i = 0; i < 40; i++) {
      if (await evaluate(`!!document.querySelector(".ww-enter")`)) { booted = true; break; }
      await sleep(500);
    }
    check("loader-fallback", "app boots when the compiled script is unavailable", booted, "interactive cover did not appear");
    const fallbackWarns = consoleWarns.filter(w => /Springboard app precompile fallback/.test(w));
    check("loader-fallback", "blocked compiled script reports the Babel fallback", fallbackWarns.length > 0, consoleWarns.join(" | "));
    await send("Fetch.disable");
  });
  console.log("done");
} catch (e) {
  check("loader-fallback", "fallback check ran to completion", false, e.message);
  console.log("FAILED: " + e.message);
}

const byCtx = {};
for (const r of results) {
  byCtx[r.ctx] = byCtx[r.ctx] || { pass: 0, fail: 0, fails: [] };
  r.ok ? byCtx[r.ctx].pass++ : (byCtx[r.ctx].fail++, byCtx[r.ctx].fails.push(r.name + (r.detail ? " :: " + r.detail : "")));
}
let total = 0, passed = 0;
console.log("\n=== UI AUDIT ===");
for (const [ctx, v] of Object.entries(byCtx)) {
  total += v.pass + v.fail; passed += v.pass;
  console.log(`${ctx.padEnd(26)} ${String(v.pass).padStart(3)}/${String(v.pass + v.fail).padEnd(3)} ${v.fail ? "FAIL " + v.fail : "ok"}`);
  for (const f of v.fails.slice(0, 6)) console.log("      - " + f);
}
console.log(`TOTAL ${passed}/${total} (${(passed / total * 100).toFixed(1)}%)`);
fs.writeFileSync(path.join(SCRATCH, "audit-ui.json"), JSON.stringify({ total, passed, byCtx }, null, 1));
await new Promise(resolve => server.close(resolve));
