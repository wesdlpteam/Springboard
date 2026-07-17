import { applyCors, requireTeacher, rateLimit } from "./_lib.js";

// Paste-a-post-link importer. The browser sends a public YouTube / Instagram / X /
// Facebook post URL; we ask a Cobalt instance (imputnet/cobalt) what media the post
// holds and hand back a flat, normalized list of stream URLs. We NEVER return the
// media bytes -- the browser fetches those straight from Cobalt's tunnel URLs, which
// keeps us under Vercel's ~4.5 MB response cap and off the video-transfer path.
//
// Config (Vercel env):
//   COBALT_API_URL  - base URL of a Cobalt instance, e.g. https://cobalt.example.com  (required)
//   COBALT_API_KEY  - optional Api-Key (uuid) if the instance sets API_AUTH_REQUIRED=1

const MAX_ITEMS = 20;                 // matches the reel cap; bounds a tampered caller
const COBALT_TIMEOUT_MS = 9000;       // fail before Vercel's own 10s cutoff

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi)(\?|$)/i;

// Friendly text for the Cobalt error codes teachers are most likely to hit. Anything
// unmapped falls through to a generic message so we never surface a raw code.
function friendlyError(code) {
  const c = String(code || "");
  // YouTube blocks datacenter IPs with a "sign in to confirm you're not a bot" check,
  // which Cobalt surfaces as a youtube/login error. Say so honestly instead of calling
  // a plainly-public video "private". (Checked before the generic auth branch below.)
  if (/youtube/i.test(c)) return "YouTube is blocking the free grabber (it can't tell it apart from a bot). For YouTube, use the Desktop “Download Video” app — Instagram, X and Facebook work here.";
  if (/private|auth|login|token|jwt/i.test(c)) return "This looks like a private or login-only post. The app can only grab public posts.";
  if (/unavailable|not.?found|invalid.*link|link.*invalid|fetch/i.test(c)) return "Couldn't open that link. Check it's a public post and try again.";
  if (/rate|limit/i.test(c)) return "The link service is busy right now. Wait a moment and try again.";
  if (/unsupported|service/i.test(c)) return "That site isn't supported for link import yet.";
  return "Couldn't fetch media from that link.";
}

function classify(filename, fallback) {
  const f = String(filename || "");
  if (IMAGE_EXT.test(f)) return "image";
  if (VIDEO_EXT.test(f)) return "video";
  return fallback;
}

// Turn any successful Cobalt response into { items: [{type,url,filename}], note? }.
function normalize(data) {
  const items = [];
  let note = "";

  if (data.status === "tunnel" || data.status === "redirect") {
    items.push({ type: classify(data.filename, "video"), url: data.url, filename: data.filename || "media" });
  } else if (data.status === "picker" && Array.isArray(data.picker)) {
    for (const p of data.picker) {
      if (!p || !p.url) continue;
      const type = p.type === "video" ? "video" : "image"; // photo | gif -> image
      items.push({ type, url: p.url, filename: p.filename || (type === "video" ? "clip.mp4" : "photo.jpg") });
    }
  } else if (data.status === "local-processing") {
    // High-res streams Cobalt wants the client to merge (mostly YouTube). MVP doesn't
    // merge, so we skip it rather than hand back an unplayable half-file.
    note = "That post needs extra processing the app can't do yet — try a lower quality or a different post.";
  }

  return { items: items.slice(0, MAX_ITEMS), note };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;
  if (!rateLimit(req, res, { max: 20, windowMs: 60000, name: "fetch-post-media" })) return;

  const url = String(req.body?.url || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return res.status(400).json({ error: "Paste a full post link starting with http(s)://" });
  }

  const base = String(process.env.COBALT_API_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    return res.status(503).json({ error: "The link-import service isn't set up yet." });
  }
  const apiKey = String(process.env.COBALT_API_KEY || "").trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COBALT_TIMEOUT_MS);
  try {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Api-Key ${apiKey}`;
    const r = await fetch(base + "/", {
      method: "POST",
      headers,
      body: JSON.stringify({ url, filenameStyle: "basic", downloadMode: "auto" }),
      signal: controller.signal,
    });

    let data;
    try { data = await r.json(); }
    catch (_) { return res.status(502).json({ error: "The link service gave an unexpected reply." }); }

    if (data.status === "error") {
      return res.status(502).json({ error: friendlyError(data.error?.code) });
    }

    const { items, note } = normalize(data);
    if (!items.length) {
      return res.status(200).json({ items: [], error: note || "No photos or videos found in that post." });
    }
    return res.status(200).json({ items, note });
  } catch (err) {
    if (err?.name === "AbortError") {
      return res.status(504).json({ error: "That link took too long. Try again or use a different post." });
    }
    console.error(err);
    return res.status(502).json({ error: "Couldn't reach the link-import service." });
  } finally {
    clearTimeout(timer);
  }
}
