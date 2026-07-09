import { applyCors, requireTeacher, rateLimit } from "./_lib.js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GUIDES_DIR = join(dirname(fileURLToPath(import.meta.url)), "guides");

// Append a VCE study-design extract to the last system message. Allowlist + regex guard the
// filename so raw input can never traverse the path. Unknown/missing -> messages unchanged.
export function injectStudyGuide(messages, studyGuide) {
  if (!studyGuide || typeof studyGuide.key !== "string") return messages;
  const key = studyGuide.key;
  if (!/^[a-z0-9-]+$/.test(key)) return messages;
  const file = join(GUIDES_DIR, key + ".md");
  if (!file.startsWith(GUIDES_DIR) || !existsSync(file)) return messages;
  let text = readFileSync(file, "utf8");
  const units = studyGuide.units === "3-4" ? "3-4" : "1-2";
  const wanted = units === "1-2" ? /## Units 1[–-]2/ : /## Units 3[–-]4/;
  const other  = units === "1-2" ? /## Units 3[–-]4/ : /## Units 1[–-]2/;
  const start = text.search(wanted);
  if (start >= 0) {
    const rest = text.slice(start + 1);
    const end = rest.search(other);
    const head = text.slice(0, text.indexOf("\n"));
    text = head + "\n" + (end >= 0 ? text.slice(start, start + 1 + end) : text.slice(start));
  }
  const out = messages.slice();
  const i = out.map(m => m.role).lastIndexOf("system");
  const idx = i >= 0 ? i : 0;
  out[idx] = { ...out[idx], content: out[idx].content + "\n\n--- VCE STUDY-DESIGN EXTRACT ---\n" + text };
  return out;
}

// Made to Stick (Chip & Dan Heath) — the SUCCESs frame. Owned server-side so every generated
// lesson follows the philosophy with no teacher control surface. Appended to the last system
// message only when the client marks a request as a generation (`stickiness: true`); the
// analyse call omits the flag, so it is not polluted.
const STICKINESS_GUIDANCE = [
  "Make the lesson STICK — apply the Made to Stick (Chip & Dan Heath) SUCCESs principles to every deck:",
  "- SIMPLE: find the ONE core idea and lead with it; say it as a compact, proverb-like line — not a watered-down one. Cut anything that isn't the core.",
  "- UNEXPECTED: break the student's 'guessing machine' with a surprise, or open a curiosity gap — pose a question they now NEED answered. The twist should make sense in hindsight, never a random gimmick.",
  "- CONCRETE: use specific people doing specific things, sensory detail and real examples — never abstract jargon. Give the idea 'hooks' onto what students already know.",
  "- CREDIBLE: back a claim with a vivid, checkable detail or a human-scale number (not a raw statistic), or let students test it themselves ('see for yourself').",
  "- EMOTIONAL: make them CARE by focusing on one person or one real stake, not a faceless mass; tap their identity and what matters to them, not shallow rewards.",
  "- STORY: frame the launch as a small story — a Challenge (overcome the odds), Connection (bridge people), or Creativity (a clever breakthrough) plot — so students mentally rehearse it and feel moved to act.",
  "Beat the Curse of Knowledge: never assume students already know what you know; build from the concrete up.",
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

  const payload = { model: process.env.OPENAI_MODEL || "gpt-5.4", messages: injectStickiness(injectStudyGuide(messages, studyGuide), stickiness) };
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
