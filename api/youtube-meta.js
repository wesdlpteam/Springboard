import { applyCors, requireTeacher, rateLimit } from "./_lib.js";

// Metadata for a pasted YouTube link, via YouTube's free oEmbed endpoint. oEmbed
// sends no CORS headers, so the browser can't call it directly -- we proxy it here.
// This route is NOT bot-blocked the way video downloads are (v1.19.0 Cobalt caveat):
// nothing is downloaded, the clip streams live from the teacher's own network at
// presentation time. We also proxy the thumbnail bytes (i.ytimg.com lacks CORS too)
// so the client gets a canvas-safe data URL for the reel + the AI.

const OEMBED_TIMEOUT_MS = 8000;      // fail before Vercel's own 10s cutoff
const THUMB_MAX_BYTES = 2 * 1024 * 1024; // sanity cap; real thumbs are ~30-150 KB

// Extract the 11-char video id from any common YouTube URL shape, else "".
export function youtubeVideoId(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch (_) { return ""; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  let id = "";
  if (host === "youtu.be") id = parts[0] || "";
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["shorts", "live", "embed", "v"].includes(parts[0])) id = parts[1] || "";
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
}

// Only fetch thumbnails from YouTube's own image hosts. maxresdefault is ours, but
// oembedThumbUrl comes from YouTube's JSON response -- pin it to ytimg/youtube so a
// tampered/unexpected upstream can't turn this into a server-side request to anywhere.
function isYouTubeThumbHost(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "ytimg.com" || h.endsWith(".ytimg.com") || h === "youtube.com" || h.endsWith(".youtube.com");
  } catch (_) { return false; }
}

async function fetchThumb(videoId, oembedThumbUrl, signal) {
  // maxresdefault is 16:9 and sharp but only exists for some videos; hqdefault always exists.
  const tries = [`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, oembedThumbUrl].filter(Boolean);
  for (const url of tries) {
    if (!isYouTubeThumbHost(url)) continue;
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > THUMB_MAX_BYTES) continue;
      const mime = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
      return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
    } catch (_) { /* try the next candidate */ }
  }
  return ""; // client shows a neutral placeholder poster instead
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;
  if (!rateLimit(req, res, { max: 20, windowMs: 60000, name: "youtube-meta" })) return;

  const videoId = youtubeVideoId(req.body?.url);
  if (!videoId) return res.status(400).json({ error: "That doesn't look like a YouTube video link." });

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    // oEmbed's status doubles as the embeddability check: 401/403 = owner turned
    // embedding off (the clip would never play on a slide), 404 = gone or private.
    if (r.status === 401 || r.status === 403) {
      return res.status(422).json({ error: "This video has embedding turned off, so it can't play on a slide. Pick a different clip." });
    }
    if (r.status === 404) {
      return res.status(404).json({ error: "Couldn't find that video — check the link, or it may be private." });
    }
    if (!r.ok) return res.status(502).json({ error: "YouTube's lookup gave an unexpected reply. Try again in a moment." });

    let meta;
    try { meta = await r.json(); }
    catch (_) { return res.status(502).json({ error: "YouTube's lookup gave an unexpected reply. Try again in a moment." }); }

    const thumbnailDataUrl = await fetchThumb(videoId, meta.thumbnail_url, controller.signal);
    return res.status(200).json({
      videoId,
      title: String(meta.title || ""),
      author: String(meta.author_name || ""),
      thumbnailDataUrl,
    });
  } catch (err) {
    if (err?.name === "AbortError") return res.status(504).json({ error: "YouTube took too long to answer. Try again." });
    console.error(err);
    return res.status(502).json({ error: "Couldn't reach YouTube's lookup service." });
  } finally {
    clearTimeout(timer);
  }
}
