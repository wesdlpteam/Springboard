import { applyCors, requireTeacher, rateLimit } from "./_lib.js";
import { readGuide, sliceAcLevel, sliceVceUnits, parseItems } from "./_guides.js";

// Read-only: hands the client the tickable curriculum items for one subject+year so the
// teacher can pick the specific learning intentions / content descriptions a lesson targets.
// Same security guard as injectStudyGuide (in readGuide). Unknown input -> empty, never an error.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;
  if (!rateLimit(req, res, { max: 30, windowMs: 60000, name: "guide" })) return;

  const { key, level, units } = req.body || {};
  const text = readGuide(key);
  if (!text) return res.status(200).json({ subject: "", groups: [] });

  const subject = (text.match(/^#\s+(.+)$/m)?.[1] || "").trim();
  const isAc = String(key).startsWith("ac-");
  const section = isAc ? sliceAcLevel(text, level) : sliceVceUnits(text, units);
  if (!section) return res.status(200).json({ subject, groups: [] });

  return res.status(200).json({ subject, groups: parseItems(section, isAc ? "ac" : "vce") });
}
