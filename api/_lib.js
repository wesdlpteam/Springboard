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

// Per-warm-instance in-memory throttle. Resets on cold start, so it's best-effort only --
// the OpenAI spend cap is the hard cost backstop. Clock is injectable so tests can drive it.
let _now = () => Date.now();
const _hits = new Map(); // "name|ip" -> [timestamps]

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  if (req.headers["x-real-ip"]) return String(req.headers["x-real-ip"]).trim();
  return "unknown";
}

export function rateLimit(req, res, { max, windowMs, name }) {
  const now = _now();
  const key = name + "|" + clientIp(req);
  const fresh = (_hits.get(key) || []).filter((t) => now - t < windowMs);
  if (fresh.length >= max) {
    res.status(429);
    res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
    res.json({ error: "Too many requests, slow down." });
    _hits.set(key, fresh);
    return false;
  }
  fresh.push(now);
  _hits.set(key, fresh);
  return true;
}

// test seams
export function __setNowForTests(fn) { _now = fn || (() => Date.now()); }
export function __resetRateLimit() { _hits.clear(); }
