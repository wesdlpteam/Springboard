import crypto from "node:crypto";

const ALLOWED_ORIGINS = [
  "https://wesdlpteam.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
];

export function safeEqual(a, b) {
  const rawA = String(a ?? "");
  const rawB = String(b ?? "");
  // empty always fails closed -- check BEFORE hash so unset env var never matches
  if (rawA.length === 0 || rawB.length === 0) return false;
  // hash both to fixed 32-byte len first -- raw length diff never reaches compare, no timing leak
  const A = crypto.createHash("sha256").update(rawA).digest();
  const B = crypto.createHash("sha256").update(rawB).digest();
  return crypto.timingSafeEqual(A, B);
}

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-sb-passcode, x-sb-admin, x-sb-filename");
  if (req.method === "OPTIONS") { res.status(200).end(); return true; }
  return false;
}

export function requireTeacher(req, res) {
  // Open mode: when no TEACHER_PASSCODE is configured, the school has chosen
  // to run without a passcode (cost protection = OpenAI spend cap).
  if (!process.env.TEACHER_PASSCODE) return true;
  if (!safeEqual(req.headers["x-sb-passcode"], process.env.TEACHER_PASSCODE)) {
    res.status(401).json({ error: "Invalid passcode" });
    return false;
  }
  return true;
}

export function requireAdmin(req, res) {
  if (!safeEqual(req.headers["x-sb-admin"], process.env.ADMIN_PASSWORD)) {
    res.status(401).json({ error: "Invalid admin password" });
    return false;
  }
  return true;
}
