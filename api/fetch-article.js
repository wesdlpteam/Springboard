import { applyCors, requireTeacher, rateLimit } from "./_lib.js";

// Server-side article reader. The browser can't fetch a random site directly (CORS), so the
// app's first stop is the r.jina.ai reader. That reader runs from datacenter IPs, so sites
// behind a bot check (Cloudflare "Performing security verification") hand it an interstitial
// instead of the page -- no lead image, and the challenge wording leaks in as article text.
// Verified 2026-07-30 on digital-classroom.nma.gov.au, which serves the real page to a normal
// browser request but walls the reader.
//
// This endpoint is the fallback: fetch the page ourselves with browser-shaped headers, pull the
// readable text plus a real lead image (og:image, else the first content <img>), and return the
// image inline as a data URL so CORS can never block it landing on a slide.

const FETCH_TIMEOUT_MS = 8500;          // fail before Vercel's own 10s cutoff
const MAX_HTML_BYTES = 3 * 1024 * 1024; // pages past this are chrome-heavy, not prose
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;           // the model gets a slice of this anyway
const MAX_REDIRECTS = 4;
const MIN_ARTICLE_CHARS = 200;          // less than this is a wall, a stub or a JS-only shell

// A plain fetch() UA gets challenged or served a stripped page by a lot of CMSes. These are the
// headers a normal Chrome request sends; nothing here pretends to be a logged-in user.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
};

// Kept in sync with JUNK_IMAGE in index.html (the frontend is one file with no imports).
// Site furniture that must never become a lesson's lead image.
const JUNK_IMAGE = /logo|icon|sprite|avatar|headshot|placeholder|1x1|pixel|spacer|blank|beacon|tracking|favicon|badge|banner|promo|newsletter|subscri|share|social|byline|[-_/]ads?[-_/]|\.svg(\?|$)/i;

// Wording of the common bot-check interstitials. Matched against title + the head of the text.
const BOT_WALL = /just a moment|performing security verification|security verification|checking your browser|enable javascript and cookies|attention required|verify (?:you|that you) are (?:a )?human|are you a robot|captcha|cf-browser-verification|ddos protection|access denied|request unsuccessful/i;

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "\u2013", mdash: "\u2014",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", hellip: "\u2026", middot: "\u00b7", deg: "\u00b0",
};

export function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(ENTITIES, n.toLowerCase()) ? ENTITIES[n.toLowerCase()] : m));
}
function safeCodePoint(n) {
  try { return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; } catch (_) { return ""; }
}

// Only public http(s) hosts. Blocks loopback/link-local/private ranges so a pasted link can
// never turn this into a request against Vercel's own network. Re-checked on every redirect hop.
export function publicHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch (_) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return null;
  if (host === "localhost" || /(^|\.)localhost$/.test(host) || /\.(local|internal|localdomain)$/.test(host)) return null;
  if (host.startsWith("[")) return null;                       // IPv6 literal -- never a teacher's article link
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return null;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return null;
    if (a === 169 && b === 254) return null;                   // cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
    if (a === 100 && b >= 64 && b <= 127) return null;         // CGNAT
  }
  return u;
}

async function readBytesCapped(r, max) {
  const len = Number(r.headers.get("content-length") || 0);
  if (len && len > max) return null;                           // don't even start on an oversized body
  if (!r.body || typeof r.body.getReader !== "function") {
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > max ? null : buf;
  }
  const reader = r.body.getReader();
  const chunks = [];
  let n = 0;
  let over = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { over = true; try { await reader.cancel(); } catch (_) {} break; }
    chunks.push(Buffer.from(value));
  }
  return over ? null : Buffer.concat(chunks);
}

function decodeHtml(buf, contentType) {
  const m = /charset=["']?([\w-]+)/i.exec(String(contentType || ""));
  const enc = (m ? m[1] : "utf-8").toLowerCase();
  try { return new TextDecoder(enc).decode(buf); }
  catch (_) { return buf.toString("utf8"); }
}

// fetch() with manual redirects so every hop is re-validated as a public host.
async function safeFetch(startUrl, signal, extraHeaders) {
  let target = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = publicHttpUrl(target);
    if (!u) { const e = new Error("blocked host"); e.code = "BLOCKED"; throw e; }
    const r = await fetch(u.href, { headers: { ...BROWSER_HEADERS, ...(extraHeaders || {}) }, redirect: "manual", signal });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) return { r, finalUrl: u.href };
      try { target = new URL(loc, u.href).href; } catch (_) { return { r, finalUrl: u.href }; }
      continue;
    }
    return { r, finalUrl: u.href };
  }
  const e = new Error("too many redirects");
  e.code = "REDIRECTS";
  throw e;
}

function attr(tag, name) {
  const re = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
  const m = re.exec(tag);
  if (!m) return "";
  return (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] || "").trim();
}

export function metaContent(html, keys) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const key of keys) {
    for (const tag of tags) {
      const k = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop")).toLowerCase();
      if (k !== key) continue;
      const v = decodeEntities(attr(tag, "content")).trim();
      if (v) return v;
    }
  }
  return "";
}

export function extractTitle(html) {
  const og = metaContent(html, ["og:title", "twitter:title"]);
  if (og) return og;
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ""));
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

// The part of the page that holds the story. Mastheads and promo strips live outside it, and one
// of those winning the race is what put an unrelated picture on IGNITE before.
function mainRegion(html) {
  const src = String(html || "");
  for (const tag of ["main", "article"]) {
    const re = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i");
    const m = re.exec(src);
    if (m && m[1] && m[1].length > 400) return m[1];
  }
  return src;
}

function biggestFromSrcset(srcset) {
  let best = "";
  let bestW = -1;
  for (const part of String(srcset || "").split(",")) {
    const bits = part.trim().split(/\s+/);
    if (!bits[0]) continue;
    const w = /^(\d+)w$/.exec(bits[1] || "") ? Number(RegExp.$1) : 0;
    if (w >= bestW) { bestW = w; best = bits[0]; }
  }
  return best;
}

export function extractLeadImageFromHtml(html, baseUrl) {
  const src = String(html || "");
  const abs = (u) => {
    const raw = decodeEntities(String(u || "")).trim();
    if (!raw || /^data:/i.test(raw)) return "";
    try { return new URL(raw, baseUrl).href; } catch (_) { return ""; }
  };
  const ok = (u) => !!u && /^https?:/i.test(u) && !JUNK_IMAGE.test(u);

  const meta = abs(metaContent(src, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]));
  if (ok(meta)) return meta;

  for (const tag of src.match(/<link\b[^>]*>/gi) || []) {
    if (!/image_src/i.test(attr(tag, "rel"))) continue;
    const u = abs(attr(tag, "href"));
    if (ok(u)) return u;
  }

  const scan = (region) => {
    for (const tag of region.match(/<img\b[^>]*>/gi) || []) {
      const w = Number(attr(tag, "width") || 0);
      const h = Number(attr(tag, "height") || 0);
      if ((w && w < 200) || (h && h < 200)) continue;          // trackers, thumbs, sprites
      const cands = [
        biggestFromSrcset(attr(tag, "srcset") || attr(tag, "data-srcset")),
        attr(tag, "src"),
        attr(tag, "data-src") || attr(tag, "data-original") || attr(tag, "data-lazy-src"),
      ];
      for (const c of cands) { const u = abs(c); if (ok(u)) return u; }
    }
    return "";
  };
  return scan(mainRegion(src)) || scan(src);
}

export function htmlToText(html) {
  let t = String(html || "");
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<(script|style|noscript|template|svg|iframe|form|select|button)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = mainRegion(t);
  t = t.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<br\b[^>]*>/gi, "\n");
  t = t.replace(/<li\b[^>]*>/gi, "\n- ");
  t = t.replace(/<\/(p|div|section|li|h[1-6]|tr|blockquote|figcaption|figure|td)>/gi, "\n\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = decodeEntities(t);
  t = t.replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t.slice(0, MAX_TEXT_CHARS);
}

export function looksLikeBotWall(title, text) {
  return BOT_WALL.test(String(title || "") + " " + String(text || "").slice(0, 600));
}

// Best-effort: pull the lead image's bytes so the browser gets a CORS-proof data URL. "" when the
// host blocks us, the file is too big, or it isn't actually an image -- the plain URL still ships.
async function imageDataUrl(url, signal) {
  try {
    const { r } = await safeFetch(url, signal, { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" });
    if (!r.ok) return "";
    const ct = (r.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!ct.startsWith("image/")) return "";
    const buf = await readBytesCapped(r, MAX_IMAGE_BYTES);
    if (!buf || !buf.length) return "";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (_) { return ""; }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;
  if (!rateLimit(req, res, { max: 20, windowMs: 60000, name: "fetch-article" })) return;

  const raw = String(req.body?.url || "").trim();
  const target = publicHttpUrl(raw);
  if (!target) return res.status(400).json({ error: "Paste a full article link starting with http(s)://" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const { r, finalUrl } = await safeFetch(target.href, controller.signal);
    const ct = (r.headers.get("content-type") || "").split(";")[0].toLowerCase();

    if (ct.startsWith("image/")) {
      return res.status(415).json({ error: "That link points straight at a picture, not an article. Save the picture and add it as an image instead." });
    }
    if (r.status === 401 || r.status === 402 || r.status === 403) {
      // Some sites (nma.gov.au among them) answer every server, reader service and image proxy with
      // 403 and only serve the page to a real person's browser. Nothing automatic can get in, so
      // say the two-step workaround instead of a vague failure.
      return res.status(502).json({ error: "That site only opens for a real person's browser, so the app can't read it. Open the page yourself, copy the text into the box, and right-click the picture → Save image as… then add it as an image." });
    }
    if (!r.ok) return res.status(502).json({ error: `That site answered with an error (HTTP ${r.status}). Check the link, or paste the text instead.` });
    if (ct && !/html|xml|text\/plain/.test(ct)) {
      return res.status(415).json({ error: "That link isn't a web page the app can read. Paste the text instead." });
    }

    const buf = await readBytesCapped(r, MAX_HTML_BYTES);
    if (!buf) return res.status(413).json({ error: "That page is too big to read. Paste the text instead." });
    const html = decodeHtml(buf, r.headers.get("content-type"));

    const title = extractTitle(html);
    const text = htmlToText(html);
    const image = extractLeadImageFromHtml(html, finalUrl);

    if (looksLikeBotWall(title, text)) {
      return res.status(502).json({ error: "That site is running a robot check, so the app can't read it. Copy the text in yourself, and save the picture to add as an image." });
    }
    if (text.length < MIN_ARTICLE_CHARS && !image) {
      return res.status(502).json({ error: "Couldn't find any readable text or picture on that page. Paste the text instead." });
    }

    const dataUrl = image ? await imageDataUrl(image, controller.signal) : "";
    return res.status(200).json({ title, text, image, imageDataUrl: dataUrl, finalUrl });
  } catch (err) {
    if (err?.name === "AbortError") return res.status(504).json({ error: "That page took too long to load. Try again, or paste the text instead." });
    if (err?.code === "BLOCKED") return res.status(400).json({ error: "That link doesn't point at a public web page." });
    if (err?.code === "REDIRECTS") return res.status(502).json({ error: "That link kept redirecting. Try the article's direct link." });
    console.error(err);
    return res.status(502).json({ error: "Couldn't open that link. Check it and try again." });
  } finally {
    clearTimeout(timer);
  }
}
