// Build Australian Curriculum v9 (F-10) guide cards under api/guides/ac-*.md from ACARA's
// official Machine-Readable Australian Curriculum (MRAC, April 2024 release, CC BY 4.0).
//   node tools/build-ac-guides.mjs [--cache DIR]
// Downloads each learning-area JSON-LD export once into the cache dir (default: OS tmp),
// then regenerates every ac-*.md. Re-run when ACARA ships a new MRAC release (bump MRAC_BASE).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const MRAC_BASE = "https://vocabulary.curriculum.edu.au/MRAC/2024/04/LA";
const LEARNING_AREAS = ["ART", "ENG", "HASS", "HPE", "MAT", "SCI", "TEC"]; // LAN (Languages) excluded: per-language curricula, out of scope
const GUIDES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "api", "guides");

// MRAC subject title -> guide file slug + display name + dropdown area. Must stay in sync
// with AC_SUBJECTS in index.html (keys there = slugs here).
const SUBJECTS = {
  "English":                        { slug: "ac-english", name: "English", area: "English" },
  "Mathematics":                    { slug: "ac-mathematics", name: "Mathematics", area: "Mathematics" },
  "Science":                        { slug: "ac-science", name: "Science", area: "Science" },
  "HASS F-6":                       { slug: "ac-hass-f-6", name: "HASS (F–6)", area: "Humanities and Social Sciences" },
  "History 7-10":                   { slug: "ac-history", name: "History (7–10)", area: "Humanities and Social Sciences" },
  "Geography 7-10":                 { slug: "ac-geography", name: "Geography (7–10)", area: "Humanities and Social Sciences" },
  "Civics and Citizenship 7-10":    { slug: "ac-civics-and-citizenship", name: "Civics and Citizenship (7–10)", area: "Humanities and Social Sciences" },
  "Economics and Business 7-10":    { slug: "ac-economics-and-business", name: "Economics and Business (7–10)", area: "Humanities and Social Sciences" },
  "Health and Physical Education":  { slug: "ac-health-and-physical-education", name: "Health and Physical Education", area: "Health & PE" },
  "Dance":                          { slug: "ac-dance", name: "Dance", area: "The Arts" },
  "Drama":                          { slug: "ac-drama", name: "Drama", area: "The Arts" },
  "Media Arts":                     { slug: "ac-media-arts", name: "Media Arts", area: "The Arts" },
  "Music":                          { slug: "ac-music", name: "Music", area: "The Arts" },
  "Visual Arts":                    { slug: "ac-visual-arts", name: "Visual Arts", area: "The Arts" },
  "Design and Technologies":        { slug: "ac-design-and-technologies", name: "Design and Technologies", area: "Technologies" },
  "Digital Technologies":           { slug: "ac-digital-technologies", name: "Digital Technologies", area: "Technologies" },
};

const S = "http://purl.org/ASN/schema/core/";
const D = "http://purl.org/dc/terms/";
const G = "http://purl.org/gem/qualifiers/";
const val = (n, p) => n && n[p] && n[p][0] && (n[p][0]["@value"] !== undefined ? n[p][0]["@value"] : n[p][0]["@id"]);
const label = (n) => val(n, S + "statementLabel");
const title = (n) => clean(val(n, D + "title") || "");
const notation = (n) => val(n, S + "statementNotation") || "";

// MRAC text carries HTML (<p>, <sub>, entities). Guides are plain markdown -> strip and decode.
function clean(html) {
  return String(html)
    .replace(/<\/p>\s*<p[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/&rsquo;|&lsquo;/gi, "'").replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—").replace(/&hellip;/gi, "…")
    .replace(/\s+/g, " ").trim();
}

// Foundation sorts first, then by the level's first year number ("Years 9 and 10" -> 9).
function levelRank(t) {
  if (/foundation/i.test(t)) return 0;
  const m = t.match(/\d+/);
  return m ? parseInt(m[0], 10) : 99;
}

async function fetchLearningArea(la, cacheDir) {
  const file = join(cacheDir, la + ".jsonld");
  if (!existsSync(file)) {
    const url = `${MRAC_BASE}/${la}/export/MRAC/2024/04/LA/${la}.jsonld`;
    console.log("download", url);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${la}: HTTP ${r.status}`);
    writeFileSync(file, await r.text());
  }
  return JSON.parse(readFileSync(file, "utf8"))[0]["@graph"];
}

function buildSubject(graph, byId, subjectNode) {
  const kids = (n) => (n && n[G + "hasChild"] || []).map((c) => byId[c["@id"]]).filter(Boolean);
  // Achievement standards hang off their level via isChildOf only (not the level's hasChild list).
  const asByParent = {};
  for (const n of graph) {
    if (label(n) !== "Achievement Standard") continue;
    for (const p of n[G + "isChildOf"] || []) (asByParent[p["@id"]] ||= []).push(n);
  }
  const levels = kids(subjectNode).filter((n) => label(n) === "Level")
    .sort((a, b) => levelRank(title(a)) - levelRank(title(b)));
  const out = [];
  for (const level of levels) {
    out.push(`## ${title(level)}`, "");
    for (const as of asByParent[level["@id"]] || []) out.push(`**Achievement standard:** ${clean(val(as, D + "title") || "")}`, "");
    // Strand -> Sub-Strand/Topic -> Content Description; elaborations deliberately dropped (bulk).
    (function walk(node, depth) {
      for (const child of kids(node)) {
        const l = label(child);
        if (l === "Content Description") {
          const code = notation(child);
          out.push(`- ${code ? `**${code}:** ` : ""}${title(child)}`);
        } else if (l === "Strand" || l === "Sub-Strand" || l === "Topic") {
          out.push("", `${"#".repeat(Math.min(3 + depth, 6))} ${title(child)}`, "");
          walk(child, depth + 1);
        }
      }
    })(level, 0);
    out.push("");
  }
  return out;
}

const cacheDir = (() => {
  const i = process.argv.indexOf("--cache");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : join(tmpdir(), "mrac-v9");
})();
mkdirSync(cacheDir, { recursive: true });

let built = 0;
for (const la of LEARNING_AREAS) {
  const graph = await fetchLearningArea(la, cacheDir);
  const byId = {};
  for (const n of graph) byId[n["@id"]] = n;
  for (const subjectNode of graph.filter((n) => label(n) === "Subject")) {
    const meta = SUBJECTS[title(subjectNode)];
    if (!meta) { console.warn("skip unmapped subject:", title(subjectNode)); continue; }
    const levels = (subjectNode[G + "hasChild"] || []).map((c) => byId[c["@id"]]).filter((n) => n && label(n) === "Level");
    const span = /7-10|7–10/.test(title(subjectNode)) ? "Years 7–10" : /F-6|F–6/.test(title(subjectNode)) ? "Foundation–Year 6" : "F–10";
    const body = buildSubject(graph, byId, subjectNode);
    const md = [
      `# Australian Curriculum v9: ${meta.name.replace(/\s*\(.*\)$/, "")} (${span})`,
      "",
      `Scope: one section per year level — the achievement standard plus every content description grouped by strand. Codes (e.g. AC9…) are official ACARA codes; quote them exactly, never invent new ones.`,
      "",
      `Source: Australian Curriculum Version 9, © ACARA (Australian Curriculum, Assessment and Reporting Authority), CC BY 4.0 — Machine-Readable Australian Curriculum, April 2024 release.`,
      "",
      ...body,
    ].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
    writeFileSync(join(GUIDES_DIR, meta.slug + ".md"), md);
    console.log("wrote", meta.slug + ".md", `(${levels.length} levels, ${(md.length / 1024).toFixed(1)}KB)`);
    built++;
  }
}
console.log(`done: ${built} guides -> ${GUIDES_DIR}`);
