import { applyCors, requireTeacher } from "./_lib.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;

  const { messages, response_format, max_completion_tokens, temperature } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided" });
  }

  const payload = { model: process.env.OPENAI_MODEL || "gpt-5.4", messages };
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
