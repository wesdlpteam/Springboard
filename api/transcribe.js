import { applyCors, requireTeacher } from "./_lib.js";

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;

  try {
    const raw = await readRaw(req);
    if (!raw.length) return res.status(400).json({ error: "No audio received" });
    const filename = String(req.headers["x-sb-filename"] || "audio.wav");
    const fd = new FormData();
    fd.append("model", "gpt-4o-transcribe");
    fd.append("file", new Blob([raw], { type: "audio/wav" }), filename);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: fd,
    });
    const data = await r.json();
    if (data.error) return res.status(502).json({ error: data.error.message });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
