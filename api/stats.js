import { applyCors, requireAdmin } from "./_lib.js";
import { getSql } from "./_db.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireAdmin(req, res)) return;

  try {
    const sql = getSql();
    const [totals, byDay, byCurriculum, bySubject, byRoutine, byStimulus, recent] = await Promise.all([
      sql`SELECT event, COUNT(*)::int AS n FROM events GROUP BY event ORDER BY n DESC`,
      sql`SELECT to_char(ts::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
          FROM events WHERE event = 'generate' AND ts > now() - interval '30 days'
          GROUP BY ts::date ORDER BY ts::date`,
      sql`SELECT curriculum, COUNT(*)::int AS n FROM events
          WHERE event = 'generate' AND curriculum IS NOT NULL GROUP BY curriculum ORDER BY n DESC`,
      sql`SELECT subject, COUNT(*)::int AS n FROM events
          WHERE event = 'generate' AND subject IS NOT NULL GROUP BY subject ORDER BY n DESC LIMIT 15`,
      sql`SELECT routine, COUNT(*)::int AS n FROM events
          WHERE event = 'generate' AND routine IS NOT NULL GROUP BY routine ORDER BY n DESC LIMIT 15`,
      sql`SELECT stimulus_type, COUNT(*)::int AS n FROM events
          WHERE event = 'generate' AND stimulus_type IS NOT NULL GROUP BY stimulus_type ORDER BY n DESC`,
      sql`SELECT to_char(ts, 'YYYY-MM-DD HH24:MI') AS ts, topic, curriculum, subject, year_level, routine
          FROM events WHERE event = 'generate' ORDER BY ts DESC LIMIT 50`,
    ]);
    return res.status(200).json({ totals, byDay, byCurriculum, bySubject, byRoutine, byStimulus, recent });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
