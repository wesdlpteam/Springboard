// Dev-only stub for exercising stats.html against the /api/stats contract without a
// real database. Serves the static repo root (so stats.html + fonts/ load) AND a fake
// POST /api/stats on the same origin/port, matching Task 6's response shape exactly.
//
// Usage:
//   node tools/stats-stub.mjs
//   open http://localhost:3000/stats.html
//
// Env toggles:
//   PORT                  - listen port (default 3000, matches index.html's API_BASE)
//   STUB_ADMIN_PASSWORD   - password required in the x-sb-admin header (default "test123")
//   STUB_EMPTY=1          - serve the all-empty fixture instead, to exercise the
//                           "No data yet" placeholders. Restart the process with this
//                           set to switch modes: `STUB_EMPTY=1 node tools/stats-stub.mjs`
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.STUB_ADMIN_PASSWORD || "test123";
const EMPTY = process.env.STUB_EMPTY === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".woff2": "font/woff2",
  ".js": "text/javascript",
  ".css": "text/css",
};

function emptyFixture() {
  return { totals: [], byDay: [], byCurriculum: [], bySubject: [], byRoutine: [], byStimulus: [], recent: [] };
}

function realisticFixture() {
  // 30-day window with a couple of intentional gap days, to exercise the
  // client-side "fill missing days with 0" logic in stats.html.
  const byDay = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (i % 7 === 3) continue; // simulated gap day
    const day = d.toISOString().slice(0, 10);
    byDay.push({ day, n: 1 + (i * 7 + 3) % 9 }); // deterministic, no RNG needed
  }

  return {
    totals: [
      { event: "generate", n: 128 },
      { event: "analyse", n: 96 },
      { event: "download", n: 71 },
      { event: "regenerate", n: 22 },
    ],
    byDay,
    byCurriculum: [
      { curriculum: "IB PYP", n: 54 },
      { curriculum: "IB MYP", n: 41 },
      { curriculum: "Australian Curriculum", n: 33 },
    ],
    bySubject: [
      { subject: "Science", n: 30 },
      { subject: "English", n: 27 },
      { subject: "Mathematics", n: 22 },
      { subject: "Humanities", n: 18 },
      { subject: "Art", n: 9 },
    ],
    // 12 rows on purpose — backend caps at 15, stats.html must trim to top 10 client-side.
    byRoutine: [
      { routine: "See, Think, Wonder", n: 25 },
      { routine: "Claim, Support, Question", n: 20 },
      { routine: "Connect, Extend, Challenge", n: 18 },
      { routine: "What Makes You Say That?", n: 14 },
      { routine: "Circle of Viewpoints", n: 12 },
      { routine: "Think, Puzzle, Explore", n: 11 },
      { routine: "My Perspective, Other Perspectives (For Exploring Complexity)", n: 9 },
      { routine: "Chalk Talk", n: 7 },
      { routine: "Compass Points", n: 6 },
      { routine: "I Used to Think... Now I Think...", n: 5 },
      { routine: "Zoom In", n: 4 },
      { routine: "Headlines", n: 3 },
    ],
    byStimulus: [
      { stimulus_type: "image", n: 60 },
      { stimulus_type: "video", n: 35 },
      { stimulus_type: "link", n: 20 },
      { stimulus_type: "none", n: 13 },
    ],
    recent: [
      // Deliberate XSS payloads: prove stats.html renders these as literal text
      // (textContent), never executes or injects markup.
      { ts: "2026-07-08 09:14", topic: "<script>alert(1)</script> Photosynthesis in rainforest canopies", curriculum: "IB PYP", subject: "Science", year_level: "5", routine: "See, Think, Wonder" },
      { ts: "2026-07-08 08:52", topic: "Fractions & real-world measurement", curriculum: "Australian Curriculum", subject: "Mathematics", year_level: "7", routine: "Connect, Extend, Challenge" },
      { ts: "2026-07-08 08:30", topic: "<img src=x onerror=alert(2)> Water cycle diagrams", curriculum: "IB MYP", subject: "Humanities", year_level: "8", routine: "Circle of Viewpoints" },
      { ts: "2026-07-07 15:02", topic: "World War I causes & consequences", curriculum: "IB MYP", subject: "Humanities", year_level: "9", routine: "Claim, Support, Question" },
      { ts: "2026-07-07 11:41", topic: "Persuasive writing techniques", curriculum: "Australian Curriculum", subject: "English", year_level: "6", routine: "What Makes You Say That?" },
      { ts: "2026-07-06 13:20", topic: "Colour theory in visual art", curriculum: "IB PYP", subject: "Art", year_level: "3", routine: "Think, Puzzle, Explore" },
    ],
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:" + PORT);

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  if (req.method === "POST" && url.pathname === "/api/stats") {
    const pw = req.headers["x-sb-admin"];
    if (pw !== ADMIN_PASSWORD) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid admin password" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(EMPTY ? emptyFixture() : realisticFixture()));
    return;
  }

  // Static file serving for stats.html + its font assets.
  let reqPath = url.pathname === "/" ? "/stats.html" : url.pathname;
  const filePath = path.join(ROOT, reqPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    const data = await readFile(filePath);
    const type = MIME[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log("stats-stub: http://localhost:" + PORT + "/stats.html");
  console.log("  admin password : " + ADMIN_PASSWORD);
  console.log("  empty-data mode: " + (EMPTY ? "ON (STUB_EMPTY=1)" : "off"));
});
