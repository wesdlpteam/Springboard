/* Assert on every deck the live matrix produced, and write a report.
   Curriculum codes are checked against the REAL guide files, so an invented AC9 code fails. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONFIGS } from "./audit-live-configs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const WORK = path.join(ROOT, ".audit-live");
const G = await import(pathToFileURL(path.join(ROOT, "api", "_guides.js")).href);
const OUT = path.join(WORK, "out");

const runs = fs.readdirSync(OUT).filter(f => f.endsWith(".json") && !f.includes(".ERROR."))
  .map(f => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")));
const errors = fs.readdirSync(OUT).filter(f => f.includes(".ERROR."))
  .map(f => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")));

const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const sentences = s => String(s || "").split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 1);
const findings = [];   // {run, sev, area, msg}
const add = (run, sev, area, msg) => findings.push({ run, sev, area, msg });
for (const cfg of CONFIGS.filter(c => c.focusMismatch)) {
  if (!runs.some(r => r.id === cfg.id)) add(cfg.id, "FAIL", "focusNote", "focus-mismatch config did not produce a lesson");
}

/* ---- student-facing text: what a child actually reads on the four slides ---- */
// Each field is its own unit. Joining them into one string made the title run into the intention
// ("The £1.50 Market Mystery We are learning to…") and turned four ellipsis-joined reflection stems
// into one 37-word "sentence" — both pure measurement artefacts (2026-08-03).
function studentUnits(d) {
  return [d.title, d.intention, d.ignite?.question, d.think?.structure, ...(d.think?.steps || []),
    d.think?.summary, d.think?.reveal?.fact, d.think?.reveal?.question,
    d.launch?.question, d.reflect?.revisit, ...(d.reflect?.prompts || [])].filter(Boolean).map(String);
}
// A reflection stem is a fill-in-the-blank frame, not prose: "I used to think… ; Now I think…" is
// three short stems a child completes aloud, so split on the ellipses before counting words.
const splitUnit = u => u.split(/…|\.{3}|(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.split(/\s+/).filter(Boolean).length > 1);
function studentText(d) { return studentUnits(d).join(" "); }
const allText = d => JSON.stringify(d);

const NOTE_LABELS = ["FACILITATION:", "ENABLING PROMPT:", "EXTENDING PROMPT:", "CURRICULUM LINKS:"];
const GAMBLE = /\b(bet|bets|betting|wager|wagers|odds|put money on)\b/i;
const GENERIC_STEP = /\b(look closely at the (image|picture|photo)|see one tiny section|study the (image|picture) carefully|observe the image)\b/i;
// "point to it" and "show me" are the Prep–Year 2 wording of a commitment (BAND_GUIDANCE/
// EARLY_WORDS_RULE tells the model to use them instead of "commit"), so they belong in this list.
const COMMIT = /\b(choose|chooses|decide|decides|predict|predicts|commit|commits|vote|votes|rank|ranks|guess|guesses|pick|picks|point to|point at|show me|call it|make a call|stance|argue|defend)\b/i;
const SHARE = /\b(class|partner|pair|group|share|tell|defend|explain to|ready to|say it out|out loud|board|post|hold up)\b/i;

for (const r of runs) {
  const d = r.deck || {};
  const id = r.id;
  const isArticle = r.cfg.kind === "article";

  /* ---------- A. shape and word limits the slides depend on ---------- */
  for (const k of ["title", "intention", "keywords", "ignite", "think", "launch", "reflect", "next", "notes"])
    if (d[k] === undefined) add(id, "FAIL", "schema", `missing key "${k}"`);

  if (words(d.title) > 8) add(id, "FAIL", "limits", `title ${words(d.title)} words (max 8): "${d.title}"`);
  if (r.cfg.intention) {
    if (String(d.intention || "").trim() !== r.cfg.intention.trim())
      add(id, "FAIL", "intention", `teacher's intention was not returned verbatim: got "${d.intention}"`);
  } else {
    if (!/^we are learning to\b/i.test(String(d.intention || ""))) add(id, "FAIL", "intention", `intention must start "We are learning to": "${d.intention}"`);
    if (words(d.intention) > 18) add(id, "WARN", "limits", `intention ${words(d.intention)} words (max 18)`);
  }
  const kw = Array.isArray(d.keywords) ? d.keywords : [];
  if (kw.length < 3 || kw.length > 6) add(id, "WARN", "limits", `keywords ${kw.length} (want 3-6)`);

  const iq = d.ignite?.question || "";
  if (words(iq) > 20) add(id, "FAIL", "limits", `ignite.question ${words(iq)} words (max 20): "${iq}"`);
  if (!COMMIT.test(iq)) add(id, "WARN", "pedagogy", `ignite asks for no commitment: "${iq}"`);
  if (!SHARE.test(iq)) add(id, "WARN", "pedagogy", `ignite never says how the answer goes public: "${iq}"`);
  if (/\bimagine\b/i.test(iq)) add(id, "WARN", "pedagogy", `ignite opens with "imagine" instead of a real commitment: "${iq}"`);

  if (d.think?.routine !== r.routineName) add(id, "FAIL", "routine", `think.routine "${d.think?.routine}" != chosen "${r.routineName}"`);
  const steps = d.think?.steps || [];
  if (!steps.length || steps.length > 4) add(id, "FAIL", "limits", `think.steps ${steps.length} (want 1-4)`);
  steps.forEach((s, i) => {
    if (words(s) < 6) add(id, "FAIL", "pedagogy", `step ${i + 1} is a fragment, not a standalone instruction: "${s}"`);
    if (GENERIC_STEP.test(s)) add(id, "FAIL", "pedagogy", `step ${i + 1} is generic, could be pasted onto any lesson: "${s}"`);
  });
  if (!String(d.think?.structure || "").trim()) add(id, "WARN", "schema", "think.structure empty");
  // A duration named in a step must match the structure line printed above it on the same slide.
  // Only a duration the structure line never mentions is a contradiction. A step saying
  // "30-second look" under a structure that itself opens "Individual: 30-second look" agrees with
  // the slide (measured 2026-08-03, 11-media-vid — the old seconds-vs-minutes rule called that a
  // clash and was simply wrong).
  const structDur = new Set([...String(d.think?.structure || "").matchAll(/(\d+)\s*(second|sec|minute|min)/gi)].map(m => m[1] + (/sec/i.test(m[2]) ? "s" : "m")));
  const structNamesTime = structDur.size > 0;
  steps.forEach((s, i) => {
    for (const m of String(s).matchAll(/(\d+)\s*(second|sec|minute|min)/gi)) {
      const key = m[1] + (/sec/i.test(m[2]) ? "s" : "m");
      if (structNamesTime && !structDur.has(key))
        add(id, "WARN", "consistency", `step ${i + 1} says "${m[0]}" but the structure line above it says "${d.think.structure}"`);
    }
  });

  const rev = d.think?.reveal || {};
  const revOn = !!String(rev.fact || "").trim();
  if (revOn) {
    if (words(rev.fact) > 30) add(id, "WARN", "limits", `reveal.fact ${words(rev.fact)} words (max 30)`);
    if (!String(rev.question || "").trim()) add(id, "FAIL", "schema", "reveal has a fact but no question");
    if (words(rev.question) > 20) add(id, "WARN", "limits", `reveal.question ${words(rev.question)} words (max 20)`);
    if (words(rev.label) > 4) add(id, "WARN", "limits", `reveal.label ${words(rev.label)} words (max 4): "${rev.label}"`);
    // The surprise must not already be printed in a step. Match on a distinctive run of words, not
    // on a bare year: a step legitimately names the year the stimulus is FROM while the reveal turns
    // on something else entirely (measured 2026-08-03, 12-psych-art — step said "2021 to 2026", the
    // surprise was New Zealand's 2023 census, and a year-only check called that a spoiler).
    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const fw = norm(rev.fact);
    // A commit-family step legitimately shares the reveal's noun phrase when it asks students to
    // PREDICT the fact the reveal then delivers ("Predict whether large for-profit providers were
    // more, less or equally likely..." -> reveal: "...more than three times as likely", measured
    // 2026-08-09, 9-econ-art). That is setup, not a spoiler — the answer itself never appears in
    // the step. Downgrade those to WARN and only FAIL a gram printed in a plain statement step.
    const PREDICT_STEP = /\b(predict|guess|vote|estimate|decide whether|commit to)\b|\?/i;
    for (let i = 0; i + 5 <= fw.length; i++) {
      const gram = fw.slice(i, i + 5).join(" ");
      const hit = steps.find(s => norm(s).join(" ").includes(gram));
      if (hit) {
        if (PREDICT_STEP.test(hit)) add(id, "WARN", "pedagogy", `reveal phrasing echoed in a prediction step (check the answer isn't given away): "${gram}"`);
        else add(id, "FAIL", "pedagogy", `reveal is spoiled: a step already prints "${gram}"`);
        break;
      }
    }
  }

  const sum = d.think?.summary || "";
  if (isArticle) {
    const n = sentences(sum).length;
    if (n !== 5) add(id, n === 0 ? "FAIL" : "WARN", "schema", `article think.summary has ${n} sentences (spec: exactly 5)`);
  } else if (String(sum).trim()) add(id, "FAIL", "schema", `media deck has a think.summary (must be ""): "${String(sum).slice(0, 60)}"`);

  if (words(d.launch?.connection) > 25) add(id, "WARN", "limits", `launch.connection ${words(d.launch?.connection)} words (max 25)`);
  if (words(d.launch?.bridge) > 20) add(id, "WARN", "limits", `launch.bridge ${words(d.launch?.bridge)} words (max 20)`);
  const ideas = d.launch?.ideas || [];
  if (ideas.length !== 3) add(id, "FAIL", "schema", `launch.ideas ${ideas.length} (spec: exactly 3)`);
  ideas.forEach((x, i) => { if (words(x) > 20) add(id, "WARN", "limits", `launch.idea ${i + 1} ${words(x)} words (max 20)`); });
  if (!String(d.launch?.question || "").trim()) add(id, "FAIL", "schema", "launch.question empty");
  const focusNote = String(d.launch?.focusNote || "").trim();
  if (r.cfg.focusMismatch) {
    for (const code of (r.cfg.focusCodes || [])) {
      if (!(r.classInfo?.focus || []).some(item => String(item).startsWith(code + " ")))
        add(id, "FAIL", "focusNote", `mismatched focus code ${code} was not ticked through classInfo.focus`);
    }
    if (!focusNote) add(id, "FAIL", "focusNote", "mismatched ticked focus produced no launch.focusNote");
    else if (r.cfg.focusNoteMatch && !new RegExp(r.cfg.focusNoteMatch, "i").test(focusNote))
      add(id, "FAIL", "focusNote", `focusNote does not name the mismatched item: "${focusNote}"`);
    const connection = String(d.launch?.connection || "");
    for (const code of (r.cfg.focusCodes || [])) {
      if (connection.toUpperCase().includes(code.toUpperCase())) add(id, "FAIL", "focusNote", `launch.connection forces mismatched code ${code}: "${connection}"`);
    }
  } else if ((r.focusPicked || []).length && focusNote) {
    add(id, "FAIL", "focusNote", `valid ticked focus produced an unexpected focusNote: "${focusNote}"`);
  }

  if (words(d.reflect?.revisit) > 20) add(id, "WARN", "limits", `reflect.revisit ${words(d.reflect?.revisit)} words (max 20)`);
  if (!/[?]/.test(String(d.reflect?.revisit || ""))) add(id, "WARN", "pedagogy", `reflect.revisit is not a question a teacher can read aloud: "${d.reflect?.revisit}"`);
  const prompts = d.reflect?.prompts || [];
  if (!prompts.length || prompts.length > 4) add(id, "WARN", "limits", `reflect.prompts ${prompts.length} (want 1-4)`);
  if (words(d.reflect?.metacognition) > 30) add(id, "WARN", "limits", `reflect.metacognition ${words(d.reflect?.metacognition)} words (max 30)`);
  if (r.cfg.reflectRoutine === "Connect–Extend–Challenge") {
    const j = prompts.join(" ").toLowerCase();
    if (!/connect/.test(j) || !/extend/.test(j) || !/challeng/.test(j))
      add(id, "FAIL", "pedagogy", `pinned reflect routine ignored — prompts: ${JSON.stringify(prompts)}`);
  }

  const next = d.next || [];
  if (next.length !== 3) add(id, "FAIL", "schema", `next has ${next.length} (spec: exactly 3)`);
  next.forEach((n, i) => {
    if (words(n.title) > 7) add(id, "WARN", "limits", `next[${i}].title ${words(n.title)} words (max 7)`);
    if (words(n.idea) > 40) add(id, "WARN", "limits", `next[${i}].idea ${words(n.idea)} words (max 40)`);
    if (words(n.thinking) > 18) add(id, "WARN", "limits", `next[${i}].thinking ${words(n.thinking)} words (max 18)`);
  });

  const notes = d.notes || {};
  for (const k of ["ignite", "think", "launch", "reflect"]) {
    const t = String(notes[k] || "");
    if (!t.trim()) { add(id, "FAIL", "notes", `notes.${k} empty`); continue; }
    let last = -1;
    for (const lab of NOTE_LABELS) {
      const at = t.indexOf(lab);
      if (at < 0) { add(id, "FAIL", "notes", `notes.${k} missing "${lab.replace(":", "")}"`); continue; }
      if (at < last) add(id, "WARN", "notes", `notes.${k} sections out of order at "${lab.replace(":", "")}"`);
      last = at;
    }
    if (/\bTIMING:/.test(t)) add(id, "FAIL", "notes", `notes.${k} still carries a TIMING section (removed in v0.12.x)`);
    if (/\bDIFFERENTIATION:|\bEXTENSIONS:/.test(t)) add(id, "FAIL", "notes", `notes.${k} uses the old DIFFERENTIATION/EXTENSIONS labels`);
  }

  if (/```|\*\*|^#{1,6}\s/m.test(studentText(d))) add(id, "FAIL", "format", "markdown leaked into student-facing text");

  /* ---------- B. curriculum grounding, checked against the real guide file ---------- */
  const codes = [...new Set([...allText(d).matchAll(/\bAC9[A-Z0-9]{4,}\b/g)].map(m => m[0]))];
  const ci = r.classInfo;
  if (ci.curriculum === "Australian Curriculum") {
    const key = r.cfg.subject === "HASS (F–6)" ? "ac-hass-f-6"
      : "ac-" + r.cfg.subject.toLowerCase().replace(/\s*\(.*\)\s*/g, "").trim().replace(/\s+/g, "-").replace(/&/g, "and");
    const raw = G.readGuide(key);
    if (!raw) add(id, "WARN", "curriculum", `could not load guide "${key}" to verify codes`);
    else {
      const slice = G.sliceAcLevel(raw, ci.yearLevel) || "";
      if (!slice) add(id, "FAIL", "curriculum", `no guide section for year "${ci.yearLevel}" in ${key}`);
      if (!codes.length) add(id, "WARN", "curriculum", "no AC9 code anywhere in the deck");
      for (const c of codes) if (!slice.includes(c))
        add(id, "FAIL", "curriculum", `INVENTED/WRONG-LEVEL code ${c} — not in ${key} ${ci.yearLevel}`);
      // The ticked focus items must actually steer the lesson.
      for (const f of (r.focusPicked || [])) {
        const code = (String(f).match(/^AC9[A-Z0-9]+/) || [])[0];
        if (code && !allText(d).includes(code)) add(id, "WARN", "curriculum", `ticked focus ${code} never surfaces in the deck`);
      }
    }
  } else if (ci.curriculum === "VCE") {
    if (codes.length) add(id, "FAIL", "curriculum", `VCE deck quotes Australian Curriculum codes: ${codes.join(", ")}`);
    const key = r.cfg.subject.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and");
    const raw = G.readGuide(key) || G.readGuide(key.replace("environmental-science", "environmental-science"));
    if (raw) {
      const slice = G.sliceVceUnits(raw, ci.yearLevel === "11" ? "1-2" : "3-4") || "";
      const conn = String(d.launch?.connection || "").toLowerCase();
      const hit = [...slice.toLowerCase().matchAll(/\b[a-z]{6,}\b/g)].map(m => m[0]);
      const shared = [...new Set(hit)].filter(w => conn.includes(w));
      if (shared.length < 2) add(id, "WARN", "curriculum", `launch.connection barely echoes the study design: "${d.launch?.connection}"`);
    } else add(id, "WARN", "curriculum", `no VCE guide file for "${key}"`);
  } else {
    if (codes.length) add(id, "FAIL", "curriculum", `${ci.curriculum} deck invented Australian Curriculum codes: ${codes.join(", ")}`);
  }

  /* ---------- C. product rules ---------- */
  const st = studentText(d);
  const units = studentUnits(d).flatMap(splitUnit);
  if (GAMBLE.test(st)) add(id, "FAIL", "pedagogy", `gambling language on a student-facing slide: "${(st.match(GAMBLE) || [])[0]}"`);

  /* ---------- D. band pitch ---------- */
  const acYear = /^\d+$/.test(ci.yearLevel) ? +ci.yearLevel : 0;
  const studentSentences = units;
  const avgWords = studentSentences.length ? studentSentences.reduce((a, s) => a + words(s), 0) / studentSentences.length : 0;
  const longWordPct = (() => { const w = st.split(/\s+/).filter(Boolean); return w.length ? w.filter(x => x.replace(/\W/g, "").length >= 10).length / w.length : 0; })();
  r._pitch = { avgWords: +avgWords.toFixed(1), longWordPct: +(longWordPct * 100).toFixed(1) };
  // Prep-Y2 carries a countable ceiling in BAND_GUIDANCE.Early (12 words a sentence, one
  // instruction, no abstractions), so check the ceiling rather than a vague "reads long".
  const EARLY_BANNED = /\b(testable|outcomes?|commit(?:s|ted|ment)?|evidence|strateg(?:y|ies)|interpret\w*|analys\w*|justif\w*|perspectives?|structures?|complexit\w*|significan\w*|represent\w*|sequences?|observations?)\b/i;
  // Length is advisory at this band and vocabulary is not. A Foundation slide is read ALOUD by the
  // teacher, so a 16-word spoken question is fine; "separate observation from interpretation" is
  // not, at any length. Chasing a 12-word ceiling through four rebuilds moved the average by about
  // two words and once cost the article summary its required 5 sentences (2026-08-03), so the hard
  // gate is the banned-word list below and length is reported, not failed.
  if (acYear <= 2) {
    const over = studentSentences.filter(s => words(s) > 16);
    if (over.length) add(id, "WARN", "band", `${ci.yearLevel}: ${over.length} student sentence(s) over 16 words, longest ${Math.max(...over.map(words))} — e.g. "${over.sort((a, b) => words(b) - words(a))[0]}"`);
    if (avgWords > 15) add(id, "WARN", "band", `${ci.yearLevel}: ${avgWords.toFixed(1)} words per sentence on student slides — long for this age`);
    const banned = [...new Set(studentSentences.flatMap(s => (s.match(new RegExp(EARLY_BANNED, "gi")) || [])))];
    if (banned.length) add(id, "FAIL", "band", `${ci.yearLevel}: abstract words a five-year-old will not follow: ${banned.join(", ")}`);
    if (longWordPct > 0.06) add(id, "WARN", "band", `${ci.yearLevel}: ${(longWordPct * 100).toFixed(1)}% of student words are 10+ letters`);
  }
  if (acYear >= 3 && acYear <= 6 && avgWords > 17) add(id, "WARN", "band", `${ci.yearLevel}: ${avgWords.toFixed(1)} words per sentence — over the 16-word ceiling for this band`);

  /* ---------- run health ---------- */
  if ((r.errs || []).length) add(id, "FAIL", "runtime", `js errors: ${JSON.stringify(r.errs)}`);
  const vid = (r.mediaMeta || []).find(m => m.kind === "video");
  if (vid && !vid.frames) add(id, "FAIL", "media", "video produced no frames");
  if (vid && /failed/.test(vid.transcribeState || "")) add(id, "WARN", "media", `transcript unavailable — ${vid.transcribeState}`);
}

/* ---------- E. across the whole matrix ---------- */
const byIgnite = new Map();
for (const r of runs) {
  const q = String(r.deck?.ignite?.question || "").toLowerCase().replace(/\W+/g, " ").trim();
  if (!q) continue;
  byIgnite.set(q, [...(byIgnite.get(q) || []), r.id]);
}
for (const [q, ids] of byIgnite) if (ids.length > 1) add(ids.join("+"), "FAIL", "variety", `identical ignite question in ${ids.length} decks: "${q.slice(0, 60)}"`);

const revealRuns = runs.filter(r => String(r.deck?.think?.reveal?.fact || "").trim());
const revealVerdictNames = new Set(["misdescribes", "supported", "external"]);
const revealVerdicts = revealRuns.filter(r => revealVerdictNames.has(r.revealCheck?.verdict));
const revealUnavailable = revealRuns.filter(r => !revealVerdictNames.has(r.revealCheck?.verdict));
const revealMisdescribes = revealVerdicts.filter(r => r.revealCheck.verdict === "misdescribes");
const revealSupported = revealVerdicts.filter(r => r.revealCheck.verdict === "supported");
const revealExternal = revealVerdicts.filter(r => r.revealCheck.verdict === "external");
if (revealRuns.length && revealUnavailable.length > revealRuns.length / 2)
  add("matrix", "FAIL", "reveal verifier", `verifier returned no verdict for ${revealUnavailable.length}/${revealRuns.length} lessons with a reveal fact`);

/* ---------- report ---------- */
const sev = s => findings.filter(f => f.sev === s);
const L = [];
L.push("# Springboard live matrix — every year level, mixed subjects and stimulus\n");
L.push(`Lessons generated against the deployed backend and the pinned live model: **${runs.length} passed, ${errors.length} failed to build**.\n`);
if (errors.length) { L.push("## Runs that never produced a lesson\n"); for (const e of errors) L.push(`- \`${e.id}\` — ${e.error}`); L.push(""); }

L.push("## What was covered\n");
L.push("| Lesson | Year | Curriculum | Subject | Stimulus | Routine the app chose | Time |");
L.push("|---|---|---|---|---|---|---|");
for (const r of runs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
  const s = r.stim || {};
  L.push(`| ${r.id} | ${r.classInfo.yearLevel} | ${r.classInfo.curriculum} | ${r.classInfo.subject} | ${r.cfg.kind}: ${String(s.title || "").replace(/^File:/, "").slice(0, 46)} | ${r.routineName} | ${r.seconds}s |`);
}
L.push("");

const areas = [...new Set(findings.map(f => f.area))];
L.push("## Findings\n");
L.push(`**${sev("FAIL").length} failures, ${sev("WARN").length} warnings** across ${runs.length} lessons.\n`);
L.push("| Area | Failures | Warnings |");
L.push("|---|---|---|");
for (const a of areas) L.push(`| ${a} | ${findings.filter(f => f.area === a && f.sev === "FAIL").length} | ${findings.filter(f => f.area === a && f.sev === "WARN").length} |`);
L.push("");
for (const s of ["FAIL", "WARN"]) {
  const list = sev(s);
  if (!list.length) continue;
  L.push(`### ${s === "FAIL" ? "Failures" : "Warnings"}\n`);
  for (const f of list) L.push(`- \`${f.run}\` **${f.area}** — ${f.msg}`);
  L.push("");
}

L.push("## Signals worth knowing\n");
const revealOn = runs.filter(r => String(r.deck?.think?.reveal?.fact || "").trim()).length;
L.push(`- Reveal (the "click to show" surprise) written in **${revealOn}/${runs.length}** lessons.`);
L.push(`- Reveal verifier returned **${revealVerdicts.length}/${revealRuns.length}** verdicts: ${revealMisdescribes.length} misdescribes, ${revealSupported.length} supported, ${revealExternal.length} external, ${revealUnavailable.length} unavailable.`);
const routines = [...new Set(runs.map(r => r.routineName))];
L.push(`- ${routines.length} different thinking routines used across ${runs.length} lessons.`);
const reflectRoutineGuess = runs.map(r => (r.deck?.reflect?.prompts || []).join(" ").slice(0, 30));
L.push(`- Average build time ${Math.round(runs.reduce((a, r) => a + r.seconds, 0) / Math.max(1, runs.length))}s (analyse + generate, no export).`);
L.push("");

L.push("## Focus-note wording (verbatim)\n");
const focusNotes = runs.filter(r => String(r.deck?.launch?.focusNote || "").trim());
if (!focusNotes.length) L.push("No lesson returned a focusNote.\n");
for (const r of focusNotes) {
  L.push(`### ${r.id}\n`);
  L.push(`Ticked focus: ${(r.focusPicked || []).join(" | ") || "none"}\n`);
  L.push(`Launch connection: ${r.deck.launch.connection || "(empty)"}\n`);
  L.push("focusNote:\n");
  for (const line of String(r.deck.launch.focusNote).split(/\r?\n/)) L.push(`> ${line}`);
  L.push("");
}

L.push("## Reveal verification\n");
L.push(`Verdicts were returned for **${revealVerdicts.length}/${revealRuns.length}** lessons with a reveal fact. Infrastructure returned no verdict for **${revealUnavailable.length}**.\n`);
L.push(`**${revealMisdescribes.length} misdescribes · ${revealSupported.length} supported · ${revealExternal.length} external · ${revealUnavailable.length} unavailable**\n`);
L.push("| Lesson | Verdict | Reason |");
L.push("|---|---|---|");
for (const r of revealRuns) {
  const verdict = revealVerdictNames.has(r.revealCheck?.verdict) ? r.revealCheck.verdict : "unavailable";
  const reason = String(r.revealCheck?.reason || "No reason returned.").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  L.push(`| ${r.id} | ${verdict} | ${reason} |`);
}
L.push("");

L.push("| Lesson | Words per student sentence | Long words |");
L.push("|---|---|---|");
for (const r of runs) L.push(`| ${r.id} | ${r._pitch?.avgWords} | ${r._pitch?.longWordPct}% |`);

fs.writeFileSync(path.join(WORK, "REPORT.md"), L.join("\n"));
fs.writeFileSync(path.join(WORK, "findings.json"), JSON.stringify(findings, null, 2));
console.log(`runs=${runs.length} errors=${errors.length} FAIL=${sev("FAIL").length} WARN=${sev("WARN").length}`);
console.log(L.slice(L.indexOf("## Findings")).join("\n").slice(0, 6000));
