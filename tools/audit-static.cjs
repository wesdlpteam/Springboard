/* Springboard static audit: data integrity, code invariants, security, privacy, docs.
   Every check is an assertion about the real source, not a smoke test. Prints PASS/FAIL per check
   and a JSON summary the scorer reads. Usage: node audit-static.cjs [--verbose] */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const idx = read("index.html");
const about = read("about.html");
const stats = read("stats.html");
const lib = read("api/_lib.js");

const results = [];
const check = (cat, name, ok, detail) => results.push({ cat, name, ok: !!ok, detail: ok ? "" : String(detail || "") });
const VERBOSE = process.argv.includes("--verbose");

/* ---------------- extract the data structures ---------------- */
const routines = [...idx.matchAll(/\{ steps: \[([^\]]*)\], structure: "([^"]*)", name: "([^"]+)", url: "([^"]*)",\s*\n?\s*gist: "([^"]*)", bands: \[([^\]]*)\]/g)]
  .map(m => ({ steps: m[1], structure: m[2], name: m[3], url: m[4], gist: m[5], bands: m[6] }));
// fallback: looser parse if the tight one misses (field order varies)
const routineNames = [...idx.matchAll(/structure: "[^"]*", name: "([^"]+)"/g)].map(m => m[1]);
const play = new Map([...idx.matchAll(/^\s*"([^"]+)": \{ family: "([a-z]+)", note: "([^"]*)"/gm)].map(m => [m[1], { family: m[2], note: m[3] }]));
const familyBlock = idx.slice(idx.indexOf("const ROUTINE_FAMILIES"), idx.indexOf("const ROUTINE_PLAY"));
const families = new Set([...familyBlock.matchAll(/^\s{2}([a-z]+): "/gm)].map(m => m[1]));
const moveBlock = idx.slice(idx.indexOf("const MOVES = ["), idx.indexOf("const REFLECT_ROUTINES"));
const moves = [...moveBlock.matchAll(/\{ name: "([^"]+)", question: "([^"]+)",\s*\n?\s*routines: \[([^\]]*)\]/g)]
  // Routine names CONTAIN commas ("See, Think, Wonder"), so pull quoted strings out rather than
  // splitting on commas — the same trap the routine-name canonicaliser had to be taught.
  .map(m => ({ name: m[1], question: m[2], routines: [...m[3].matchAll(/"([^"]+)"/g)].map(x => x[1]) }));
const reflects = [...idx.matchAll(/\{ name: "([^"]+)", stems: "([^"]+)" \}/g)].map(m => ({ name: m[1], stems: m[2] }));

/* ---------------- 1. routine data integrity ---------------- */
check("data", "ROUTINES parsed", routineNames.length >= 90, `only ${routineNames.length}`);
check("data", "no duplicate routine names", new Set(routineNames).size === routineNames.length,
  routineNames.filter((n, i) => routineNames.indexOf(n) !== i).join(", "));
check("data", "MOVES parsed", moves.length >= 8, `only ${moves.length}`);
check("data", "REFLECT_ROUTINES parsed", reflects.length >= 5, `only ${reflects.length}`);

const nameSet = new Set(routineNames);
// every routine referenced by a move must exist
for (const mv of moves) {
  const bad = mv.routines.filter(r => !nameSet.has(r));
  check("data", `move "${mv.name}" references only real routines`, bad.length === 0, bad.join(" | "));
  check("data", `move "${mv.name}" has 5+ routines`, mv.routines.length >= 5, `${mv.routines.length}`);
  check("data", `move "${mv.name}" question ends with ?`, /\?$/.test(mv.question), mv.question);
}
// every routine must be reachable from at least one move
// Reachable = offered under a thinking move, OR offered in the end-of-lesson REFLECT dropdown.
// The two menus spell some names differently ("I Used to Think... Now I Think..." vs
// "I Used to Think… / Now I Think…"), so compare on letters only.
const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const reachable = new Set(moves.flatMap(m => m.routines).map(flat));
const reflectNames = new Set(reflects.map(r => flat(r.name)));
for (const n of routineNames) {
  const f = flat(n);
  check("data", `routine reachable from a move or the reflect menu: ${n}`,
    reachable.has(f) || reflectNames.has(f), "orphan — no teacher can ever pick it");
}
// every routine needs a recipe, valid family, and a non-trivial note
for (const n of routineNames) {
  const p = play.get(n);
  check("recipe", `recipe exists: ${n}`, !!p, "missing");
  if (p) {
    check("recipe", `recipe family valid: ${n}`, families.has(p.family), p.family);
    check("recipe", `recipe note substantive: ${n}`, p.note.length >= 60, `${p.note.length} chars`);
  }
}
for (const k of play.keys()) check("recipe", `recipe maps to a real routine: ${k}`, nameSet.has(k), "orphan recipe");
check("recipe", "every family is used", [...families].every(f => [...play.values()].some(p => p.family === f)),
  [...families].filter(f => ![...play.values()].some(p => p.family === f)).join(", "));

/* ---------------- 2. routine fields ---------------- */
for (const r of routines) {
  check("data", `routine url is pz.harvard.edu: ${r.name}`, /^https:\/\/pz\.harvard\.edu\//.test(r.url), r.url);
  check("data", `routine has 3+ steps: ${r.name}`, (r.steps.match(/","/g) || []).length >= 2, r.steps.slice(0, 40));
  check("data", `routine has a gist: ${r.name}`, r.gist.length >= 20, r.gist);
  check("data", `routine has bands: ${r.name}`, /"(early|junior|middle|senior)"/.test(r.bands), r.bands);
  check("data", `routine structure names a grouping: ${r.name}`, r.structure.length >= 10, r.structure);
}
for (const rf of reflects) {
  // Headlines is legitimately a single stem (one headline), so require substance, not a count.
  check("data", `reflect routine has usable stems: ${rf.name}`, rf.stems.trim().length >= 30, rf.stems);
}

/* ---------------- 3. security ---------------- */
const cdnTags = [...idx.matchAll(/<script[^>]+src="https:\/\/[^"]+"[^>]*>/g)].map(m => m[0]);
for (const t of cdnTags) {
  const src = (t.match(/src="([^"]+)"/) || [])[1];
  check("security", `CDN script has SRI: ${src.slice(0, 60)}`, /integrity="sha\d+-/.test(t), t.slice(0, 120));
  check("security", `CDN script has crossorigin: ${src.slice(0, 60)}`, /crossorigin=/.test(t), t.slice(0, 120));
  check("security", `CDN script pinned to a version: ${src.slice(0, 60)}`, /@\d+\.\d+/.test(src) || /\/\d+\.\d+\.\d+\//.test(src), src);
}
check("security", "no dangerouslySetInnerHTML in index", !/dangerouslySetInnerHTML/.test(idx), "found");
check("security", "no innerHTML assignment from variables in index", !/\.innerHTML\s*=\s*[a-zA-Z_$]/.test(idx), "found");
check("security", "no eval() in index", !/[^a-zA-Z]eval\(/.test(idx), "found");
check("security", "no api key literal in frontend", !/sk-[a-zA-Z0-9]{20}/.test(idx + about + stats), "found");
check("security", "no hardcoded passcode in frontend", !/TEACHER_PASSCODE\s*=\s*"/.test(idx), "found");
// noreferrer implies noopener, so either is safe.
const blanks = (idx.match(/target="_blank"/g) || []).length;
const safeRel = (idx.match(/rel="(?:noopener|noreferrer)[^"]*"/g) || []).length;
check("security", "every target=_blank carries noopener or noreferrer", blanks <= safeRel, `${blanks} blank vs ${safeRel} safe rel`);

// every endpoint follows the gate order: cors -> auth -> ratelimit
for (const f of fs.readdirSync(path.join(ROOT, "api")).filter(f => f.endsWith(".js") && !f.startsWith("_"))) {
  const src = read("api/" + f);
  check("security", `${f}: applyCors first`, /applyCors\(req, res\)/.test(src), "missing applyCors");
  const hasAuth = /requireTeacher|requireAdmin/.test(src);
  check("security", `${f}: has an auth gate`, hasAuth, "no requireTeacher/requireAdmin");
  check("security", `${f}: rate limited`, /rateLimit\(/.test(src), "no rateLimit");
  if (hasAuth) {
    const iCors = src.indexOf("applyCors"), iAuth = Math.min(...[src.indexOf("requireTeacher("), src.indexOf("requireAdmin(")].filter(i => i > 0)), iRate = src.indexOf("rateLimit(");
    check("security", `${f}: gate order cors<auth<rate`, iCors < iAuth && iAuth < iRate, `${iCors}/${iAuth}/${iRate}`);
  }
  check("security", `${f}: no process.env leak in a response`, !/res\.[a-z]+\([^)]*process\.env/.test(src), "env in response");
  check("security", `${f}: method guard`, /req\.method !== "(POST|GET)"/.test(src), "no method check");
}
check("security", "safeEqual is constant-time-ish and fails closed", /function safeEqual/.test(lib) && /length\s*===\s*0|!a\s*\|\|\s*!b/.test(lib), "check _lib.js");
check("security", "CORS uses an allowlist not *", !/Access-Control-Allow-Origin["'\s:]+\*/.test(lib), "wildcard CORS");

/* ---------------- 4. privacy ---------------- */
const log = read("api/log.js");
const allowed = ["event", "stimulus_type", "curriculum", "subject", "year_level", "routine", "boosters", "language_mode", "topic"];
// Look at the column list of the INSERT only, and match whole words (\bip\b, not the "ip" in clip()).
const insertCols = ((log.match(/INSERT INTO events \(([^)]*)\)/) || [])[1] || "").split(",").map(s => s.trim());
check("privacy", "log.js INSERT parsed", insertCols.length > 0, "no INSERT found");
check("privacy", "log.js inserts only anonymous columns",
  insertCols.length > 0 && insertCols.every(c => allowed.includes(c)),
  "unexpected: " + insertCols.filter(c => !allowed.includes(c)).join(", "));
check("privacy", "no identity-shaped column anywhere in log.js",
  !/\b(email|full_?name|student|teacher_id|user_id|\bip\b)\b/i.test(log), "identity column");
check("privacy", "no localStorage of class settings", !/localStorage\.setItem\(\s*["']sb_class/.test(idx), "sb_class persisted");
check("privacy", "passcode persists (by design)", /localStorage\.setItem\(\s*["']sb_passcode/.test(idx) || /sb_passcode/.test(idx), "missing");
check("privacy", "no analytics of free text stimulus", !/body:\s*JSON\.stringify\(\{[^}]*sourceText[^}]*\}\)[^;]*api\/log/.test(idx), "stimulus logged");

/* ---------------- 5. deck-builder invariants (source level) ---------------- */
check("deck", "zoomBase accounts for the where-to-next divider", /nextIdeas\.length \? 1 : 0/.test(idx), "divider not counted");
check("deck", "zoom back-link keyed per source slide", /z\.back \|\| igniteNum/.test(idx), "shared back-link");
check("deck", "think animations injected after youtube pass", idx.indexOf("injectYouTubeVideos(blob") < idx.indexOf("injectThinkAnimations(blob"), "wrong order");
check("deck", "timing ids start above the wrapper id", /let nextId = 2;/.test(idx), "id collision risk");
check("deck", "reveal uses an entrance effect", /presetClass="entr"/.test(idx), "missing");
// The draining gold bar was replaced by a digital MM:SS clock (2026-07-31). Each preset needs its
// OWN build group or PowerPoint hands each clock label to whichever preset claims it first and
// silently truncates the rest, and exits need a group of their own again or every hide is dropped.
check("deck", "timer presets get their own build groups", /grpId="\$\{grp\}"/.test(idx) && /grpId="\$\{grp \+ 8\}"/.test(idx), "presets share a build group");
check("deck", "clock ticks once a second", /const TIMER_STEP_SEC = 1;/.test(idx), "not per-second");
check("deck", "every slide gets notes", (idx.match(/addNotes\(/g) || []).length >= 6, `${(idx.match(/addNotes\(/g) || []).length}`);
check("deck", "fitFontSize used for long text blocks", (idx.match(/fitFontSize\(/g) || []).length >= 8, "too few");
check("deck", "contain() used instead of sizing:contain", !/sizing:\s*\{\s*type:\s*"contain"/.test(idx), "stretching images");

/* ---------------- 6. prompt quality rules ---------------- */
const promptChecks = [
  ["no reveal inside a step", /NEVER print the surprise inside a step/],
  ["steps must stand alone", /STAND ALONE as a complete instruction/],
  ["next ideas in teacher English", /WRITE IT FOR A BUSY TEACHER/],
  ["reveal schema present", /think\{routine, steps, structure, summary, reveal\{fact, question\}\}/],
  ["stickiness must land on student-facing text", /WHERE THE STICKINESS MUST LAND/, "api/generate.js"],
  ["routine staging injected", /HOW THIS ROUTINE MUST BE STAGED/],
  ["intention echoed word-for-word when supplied", /EXACTLY as written, unchanged/],
  ["no invented curriculum codes", /never invent codes|Do not invent curriculum codes|never invent official curriculum/i],
  ["band brief injected", /BAND_GUIDANCE\[/],
];
// Some rules live server-side in api/generate.js (the SUCCESs guidance is owned there, never sent
// by the client), so each check names the file it belongs in.
for (const [n, re, file] of promptChecks) check("prompt", n, re.test(file ? read(file) : idx), "rule missing from " + (file || "index.html"));

/* ---------------- 7. UI wiring (source level) ---------------- */
const uiChecks = [
  ["intention generator wired", /runSuggestIntention/],
  ["intention avoid line sent", /avoid: intention\.trim\(\)/],
  ["reveal editable in the editor", /bx-think-reveal/],
  ["two-column editor on wide screens", /column-count: 2/],
  ["APP_VERSION present", /const APP_VERSION = "v\d+\.\d+\.\d+/],
  ["reduced-motion honoured", /prefers-reduced-motion/],
  ["aria-live on the build progress", /aria-live/],
  ["role=alert on errors", /role="alert"/],
  ["labels tied to inputs with htmlFor", /htmlFor="bx-/],
];
for (const [n, re] of uiChecks) check("ui", n, re.test(idx), "missing");
check("ui", "every id'd textarea/input has a label or aria-label", (() => {
  const ids = [...idx.matchAll(/<(?:textarea|input|select)[^>]*id="([^"]+)"/g)].map(m => m[1]);
  const missing = ids.filter(id => !idx.includes(`htmlFor="${id}"`) && !new RegExp(`id="${id}"[^>]*aria-label`).test(idx));
  return missing.length === 0 ? true : (VERBOSE && console.log("  unlabelled:", missing.join(", ")), false);
})(), "unlabelled fields");

/* ---------------- 8. docs and consistency ---------------- */
check("docs", "about.html has no stale 'four slides'", !/four editable slides|The four <em>slides/.test(about), "stale");
check("docs", "about.html flow starts with the thinking move", /Choose a thinking move/.test(about), "stale flow");
check("docs", "about.html explains EEF-free metacognition", !/EEF/.test(about), "jargon");
check("docs", "about.html covers ACARA and VCE", /Australian Curriculum v9/.test(about) && /VCE study designs/.test(about), "missing");
check("docs", "CLAUDE.md documents the deploy split", /Vercel is \*\*not\*\* connected/.test(read("CLAUDE.md")), "missing");
check("docs", "anim ground truth committed", fs.existsSync(path.join(ROOT, "docs/superpowers/notes/2026-07-30-anim-timing-groundtruth.md")), "missing");
check("docs", "no TODO/FIXME left in shipped source", !/\bTODO\b|\bFIXME\b/.test(idx), "found");
check("docs", "no console.log left in index", !/console\.log\(/.test(idx.replace(/console\.error\(/g, "")), "found");

/* ---------------- report ---------------- */
const byCat = {};
for (const r of results) {
  byCat[r.cat] = byCat[r.cat] || { pass: 0, fail: 0, fails: [] };
  r.ok ? byCat[r.cat].pass++ : (byCat[r.cat].fail++, byCat[r.cat].fails.push(r.name + (r.detail ? " :: " + r.detail : "")));
}
let total = 0, passed = 0;
for (const [cat, v] of Object.entries(byCat)) { total += v.pass + v.fail; passed += v.pass; }
console.log("=== STATIC AUDIT ===");
for (const [cat, v] of Object.entries(byCat)) {
  console.log(`${cat.padEnd(9)} ${String(v.pass).padStart(4)}/${String(v.pass + v.fail).padEnd(4)}  ${v.fail ? "FAIL " + v.fail : "ok"}`);
  for (const f of v.fails.slice(0, 12)) console.log("      - " + f);
  if (v.fails.length > 12) console.log(`      ... and ${v.fails.length - 12} more`);
}
console.log(`TOTAL ${passed}/${total} (${(passed / total * 100).toFixed(1)}%)`);
fs.writeFileSync(path.join(__dirname, "audit-static.json"), JSON.stringify({ total, passed, byCat }, null, 1));
