/* Build a real stimulus pack for the Springboard live matrix test.
   Images + videos from Wikimedia Commons (search, so no guessed URLs); articles from
   The Conversation AU via the jina reader. Writes scratchpad/stimuli/. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", ".audit-live", "stimuli");
fs.mkdirSync(OUT, { recursive: true });
const UA = { "User-Agent": "SpringboardClassroomTest/1.0 (nathan.benn@gmail.com)" };
const API = "https://commons.wikimedia.org/w/api.php";

const IMAGES = [
  { key: "migrant-mother",  q: 'Lange Migrant Mother 1936' },
  { key: "earth-apollo",    q: 'Earth seen from Apollo 17 blue marble' },
  { key: "great-wave",      q: 'Hokusai Great Wave off Kanagawa' },
  { key: "eniac",           q: 'ENIAC computer 1946 Penn' },
  { key: "bee-flower",      q: 'honey bee pollen flower macro' },
  { key: "market-stall",    q: 'market stall fruit vegetables prices' },
  { key: "coral-bleaching", q: 'coral bleaching Great Barrier Reef' },
  { key: "school-sport",    q: 'children playing football school ground' },
  { key: "bridge-build",    q: 'Sydney Harbour Bridge construction 1930' },
  { key: "plastic-beach",   q: 'plastic waste pollution beach' },
];

const VIDEOS = [
  { key: "pollination",  q: 'honey bee pollination flower' },
  { key: "lava",         q: 'lava flow volcano eruption' },
  { key: "plant-growth", q: 'plant growth timelapse seedling' },
  { key: "dance",        q: 'traditional dance performance folk' },
  { key: "printer3d",    q: '3D printer printing object' },
  { key: "storm",        q: 'thunderstorm clouds timelapse' },
  { key: "traffic",      q: 'city traffic intersection timelapse' },
  { key: "robot-arm",    q: 'industrial robot arm working' },
];

const j = async (u) => {
  const r = await fetch(u, { headers: UA });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
};

async function commonsSearch(q, kind) {
  const filter = kind === "video" ? "filetype:video " : "filetype:bitmap ";
  const u = `${API}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(filter + q)}` +
    `&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1100`;
  const r = await j(u);
  const pages = Object.values(r.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map(p => ({ title: p.title, info: p.imageinfo?.[0] })).filter(p => p.info);
}

async function download(url, dest) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

const manifest = { images: [], videos: [], articles: [] };

for (const spec of IMAGES) {
  try {
    const hits = await commonsSearch(spec.q, "image");
    const hit = hits.find(h => /^image\/(jpeg|png)$/.test(h.info.mime) && h.info.thumburl);
    if (!hit) { console.log(`IMG MISS ${spec.key}`); continue; }
    const ext = hit.info.mime === "image/png" ? ".png" : ".jpg";
    const file = path.join(OUT, spec.key + ext);
    const bytes = await download(hit.info.thumburl, file);
    manifest.images.push({ key: spec.key, file, title: hit.title, page: hit.info.descriptionurl, bytes });
    console.log(`IMG OK  ${spec.key.padEnd(16)} ${(bytes / 1024).toFixed(0)}KB  ${hit.title}`);
  } catch (e) { console.log(`IMG ERR ${spec.key}: ${e.message}`); }
}

for (const spec of VIDEOS) {
  try {
    const hits = await commonsSearch(spec.q, "video");
    // Small enough that the app embeds it (<25MB) and the WAV transcode stays quick.
    const hit = hits.find(h => /webm|ogg/.test(h.info.mime || "") && h.info.size > 200_000 && h.info.size < 14_000_000);
    if (!hit) { console.log(`VID MISS ${spec.key} (${hits.map(h => Math.round((h.info.size || 0) / 1e6) + "MB").join(",")})`); continue; }
    const ext = /ogg/.test(hit.info.mime) ? ".ogv" : ".webm";
    const file = path.join(OUT, spec.key + ext);
    const bytes = await download(hit.info.url, file);
    manifest.videos.push({ key: spec.key, file, title: hit.title, page: hit.info.descriptionurl, bytes, mime: hit.info.mime });
    console.log(`VID OK  ${spec.key.padEnd(16)} ${(bytes / 1e6).toFixed(1)}MB ${hit.title}`);
  } catch (e) { console.log(`VID ERR ${spec.key}: ${e.message}`); }
}

/* ---- articles: real, current pieces from The Conversation AU (CC-BY) ---- */
const TOPICS = [
  "https://theconversation.com/au/environment",
  "https://theconversation.com/au/science",
  "https://theconversation.com/au/education",
  "https://theconversation.com/au/business",
  "https://theconversation.com/au/politics",
  "https://theconversation.com/au/arts",
  "https://theconversation.com/au/health",
];
const seen = new Set();
const wantPerTopic = 2;
for (const topic of TOPICS) {
  try {
    const md = await (await fetch("https://r.jina.ai/" + topic, { headers: UA })).text();
    const links = [...md.matchAll(/\((https:\/\/theconversation\.com\/[a-z0-9-]{25,}-\d{5,})\)/g)].map(m => m[1]);
    let taken = 0;
    for (const link of links) {
      if (taken >= wantPerTopic) break;
      if (seen.has(link)) continue;
      seen.add(link);
      try {
        const txt = await (await fetch("https://r.jina.ai/" + link, { headers: UA })).text();
        const title = (txt.match(/^Title:\s*(.+)$/m) || [, ""])[1].trim();
        // Strip the reader's header block and any trailing boilerplate, keep the body.
        let body = txt.replace(/^[\s\S]*?Markdown Content:\s*/, "");
        body = body.replace(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, "$1 ").replace(/!\[[^\]]*\]\([^)]*\)/g, "");
        body = body.replace(/^\s*(Skip to content|Search analysis[^\n]*|Edition:|Become an author|Sign up[^\n]*)\s*$/gm, "");
        body = body.replace(/\n{3,}/g, "\n\n").trim();
        if (body.length < 1800) { console.log(`ART SHORT ${link} (${body.length})`); continue; }
        const key = "art-" + link.split("/").pop().slice(0, 40);
        manifest.articles.push({ key, url: link, title, topic: topic.split("/").pop(), words: body.split(/\s+/).length, text: body.slice(0, 11000) });
        taken++;
        console.log(`ART OK  ${topic.split("/").pop().padEnd(12)} ${body.split(/\s+/).length}w  ${title.slice(0, 70)}`);
      } catch (e) { console.log(`ART ERR ${link}: ${e.message}`); }
    }
  } catch (e) { console.log(`TOPIC ERR ${topic}: ${e.message}`); }
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nPACK: ${manifest.images.length} images, ${manifest.videos.length} videos, ${manifest.articles.length} articles -> ${OUT}`);
