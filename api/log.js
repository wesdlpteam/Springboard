import { applyCors, requireTeacher, rateLimit } from "./_lib.js";
import { getSql } from "./_db.js";

const EVENTS = new Set(["analyse", "generate", "regenerate", "download"]);
const clip = (v) => (v == null || v === "" ? null : String(v).slice(0, 300));

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;
  if (!rateLimit(req, res, { max: 60, windowMs: 60000, name: "log" })) return;

  const b = req.body || {};
  if (!EVENTS.has(b.event)) return res.status(400).json({ error: "Unknown event" });

  try {
    const sql = getSql();
    await sql`
      INSERT INTO events (event, stimulus_type, curriculum, subject, year_level, routine, boosters, language_mode, topic)
      VALUES (${b.event}, ${clip(b.stimulusType)}, ${clip(b.curriculum)}, ${clip(b.subject)},
              ${clip(b.yearLevel)}, ${clip(b.routine)}, ${clip(b.boosters)}, ${clip(b.languageMode)}, ${clip(b.topic)})`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
