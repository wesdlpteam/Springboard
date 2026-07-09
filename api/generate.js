import { applyCors, requireTeacher } from "./_lib.js";
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

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;

  const { messages, response_format, max_completion_tokens, temperature, studyGuide } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided" });
  }

  const payload = { model: process.env.OPENAI_MODEL || "gpt-5.4", messages: injectStudyGuide(messages, studyGuide) };
  if (response_format) payload.response_format = response_format;
  if (max_completion_tokens !== undefined) payload.max_completion_tokens = max_completion_tokens;
  if (temperature !== undefined) payload.temperature = temperature;

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
