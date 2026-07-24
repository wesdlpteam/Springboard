import { applyCors, requireTeacher, rateLimit } from "./_lib.js";
import { GUIDES_DIR, readGuide, sliceAcLevel, sliceVceUnits } from "./_guides.js";

export { sliceAcLevel }; // keep the existing test import path working

// Append a curriculum extract to the last system message: a VCE study-design unit slice
// ({key, units}) or an Australian Curriculum year-level slice ({key: "ac-*", level}).
// Allowlist + regex guard the filename so raw input can never traverse the path.
// Unknown/missing/unmatched -> messages unchanged.
export function injectStudyGuide(messages, studyGuide) {
  if (!studyGuide || typeof studyGuide.key !== "string") return messages;
  const key = studyGuide.key;
  const raw = readGuide(key);
  if (!raw) return messages;
  let text = raw;
  let banner = "--- VCE STUDY-DESIGN EXTRACT ---";
  if (key.startsWith("ac-")) {
    const sliced = sliceAcLevel(text, studyGuide.level);
    if (!sliced) return messages;
    text = sliced;
    banner = "--- AUSTRALIAN CURRICULUM v9 EXTRACT ---";
  } else {
    const section = sliceVceUnits(text, studyGuide.units);
    if (section) {
      const head = text.slice(0, text.indexOf("\n"));
      text = head + "\n" + section;
    }
  }
  const out = messages.slice();
  const i = out.map(m => m.role).lastIndexOf("system");
  const idx = i >= 0 ? i : 0;
  out[idx] = { ...out[idx], content: out[idx].content + "\n\n" + banner + "\n" + text };
  return out;
}

// Made to Stick (Chip & Dan Heath) — the SUCCESs frame, read from the book and distilled into
// deck-writing instructions. Owned server-side so every generated lesson follows the philosophy
// with no teacher control surface. Appended to the last system message only when the client marks
// a request as a generation (`stickiness: true`); the analyse call omits the flag, so it is not
// polluted. Two parts: (1) the six principles with their highest-leverage tactics, (2) how they
// map onto Springboard's four slides. The framing villain is the Curse of Knowledge.
const STICKINESS_GUIDANCE = [
  "Make this lesson STICK. Apply the Made to Stick (Chip & Dan Heath) SUCCESs principles. Your enemy is the CURSE OF KNOWLEDGE: you and the teacher already grasp this topic, so it is hard to imagine not knowing it. Never assume students know what you know — build every idea up from the concrete, and pressure-test each slide as a student meeting the topic cold.",
  "- SIMPLE = core + compact (this is prioritising, NOT dumbing down). Find the ONE core idea — finish 'if students remember nothing else today, they must ___' — and lead with it as a compact, proverb-like line. Be a master of exclusion: cut good material that isn't the core, because many priorities means none. Make the core travel by packaging it as a high-concept analogy ('this is X for Y') or by naming something students already know (a schema), so a few words carry a lot of meaning.",
  "- UNEXPECTED = break the guessing machine, then open a gap. Lead with something that violates what students expect (a counter-intuitive fact or surprising result) to buy attention. To HOLD attention, use the gap theory of curiosity: pose a real question they now NEED answered and withhold the answer; frame the content as a mystery to be solved. Get students to COMMIT to a guess before any reveal (disagreement between guesses is good). The twist must be postdictable (obvious in hindsight) and must serve the core idea — never surprise for its own sake.",
  "- CONCRETE = picture it with the senses. Use specific people doing specific things, real places and sensory detail — never abstract jargon (abstraction is the expert's luxury; novices need the concrete). Concreteness gives memory more hooks (Velcro). Anchor every abstract term to something students can picture, and build the abstract concept ON a concrete example, not the reverse. Prefer one named case ('work out what Kris should charge') over a faceless prompt ('analyse pricing').",
  "- CREDIBLE = make it believable, ideally by letting them test it. Strongest is a testable credential — 'see for yourself': let students predict, check, or try it, so the claim proves itself instead of being asserted. Back claims with a vivid, checkable detail and human-scale numbers (translate any statistic into units students can feel, or a relatable comparison — never a bare stat). Where it fits, use a Sinatra-Test exemplar (one case so strong it proves the point) or an anti-authority (someone with real lived experience, not just a title).",
  "- EMOTIONAL = make them CARE, because belief alone won't move them. Focus on ONE identifiable person or one real stake, not a faceless mass or a pile of statistics (adding numbers to a human story actually kills the feeling). Appeal to IDENTITY — 'what would someone like me do here?' — and to what students already value (mastery, fairness, belonging), not just 'you'll need this for the test'. Invite them to imagine themselves in the situation.",
  "- STORY = get them to act. Frame the launch as a small, concrete story so students mentally rehearse the ACTION — simulate the process and the steps, not a happy ending. Match the task to one of three plots: CHALLENGE (overcome the odds / underdog), CONNECTION (bridge people or opposing viewpoints), or CREATIVITY (a clever breakthrough / crack the puzzle). Prefer real, spotted stories over invented ones; a good story already carries Concrete, Emotional and Unexpected for free.",
  "Map the principles onto the four slides:",
  "- IGNITE: lead with Unexpected + Emotional + Concrete — one concrete, identifiable person or case that breaks the guessing machine and opens a curiosity gap, and invites a first guess. Do not announce the topic flatly.",
  "- THINK: use the thinking routine to hunt the core (Simple) and to make students commit to a prediction before any reveal (Unexpected); surface disagreement between their guesses where you can.",
  "- LAUNCH: frame the task as a Story plot (Challenge / Connection / Creativity) set in a specific, picture-able scenario (Concrete) that students can test for themselves (Credible).",
  "- REFLECT: return to the ONE person or stake and to the student's own identity (Emotional); ask for the one-sentence core (Simple) and a real, spotted moment from the lesson (Story), never an abstract summary.",
  "Keep the whole deck playful and human, never corporate or abstract: one core idea, built from the concrete up.",
].join("\n");

export function injectStickiness(messages, on) {
  if (!on) return messages;
  const out = messages.slice();
  const i = out.map(m => m.role).lastIndexOf("system");
  const idx = i >= 0 ? i : 0;
  out[idx] = { ...out[idx], content: out[idx].content + "\n\n" + STICKINESS_GUIDANCE };
  return out;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;
  if (!rateLimit(req, res, { max: 20, windowMs: 60000, name: "generate" })) return;

  const { messages, response_format, max_completion_tokens, temperature, studyGuide, stickiness } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided" });
  }
  // Endpoint runs in open mode (no passcode) with an OpenAI spend cap as the only backstop, and
  // CORS never blocks a no-Origin (curl) caller. So clamp every client-controlled cost knob to
  // bound per-request blast radius. The app only ever sends 2-4 messages (vision images ride as
  // content-parts inside one user message), so 20 is generous headroom, not a real limit.
  if (messages.length > 20) {
    return res.status(400).json({ error: "Too many messages" });
  }

  // Pinned to OpenAI's flagship tier by request — no env override, so a stale
  // OPENAI_MODEL var in Vercel can't silently downgrade the model.
  const payload = { model: "gpt-5.6-sol", messages: injectStickiness(injectStudyGuide(messages, studyGuide), stickiness) };
  if (response_format) payload.response_format = response_format;
  // 8000 = 2x the app's largest legit request (4000 tokens); anything bigger is abuse. Non-numeric
  // input is dropped rather than forwarded. Temperature is coerced into OpenAI's valid [0,2] range.
  if (max_completion_tokens !== undefined) {
    const n = Number(max_completion_tokens);
    if (Number.isFinite(n)) payload.max_completion_tokens = Math.min(Math.max(Math.trunc(n), 1), 8000);
  }
  if (temperature !== undefined) {
    const t = Number(temperature);
    if (Number.isFinite(t)) payload.temperature = Math.min(Math.max(t, 0), 2);
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.error) return res.status(502).json({ error: data.error.message });
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
