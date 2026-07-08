# Springboard Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork Tech Spotlight Generator into **Springboard** — a 4-slide (IGNITE → THINK → LAUNCH → REFLECT) thinking-launch PPTX generator for all subjects, with a Vercel backend holding the OpenAI key, teacher-passcode auth, a guided routine/booster flow, curriculum settings, and anonymous analytics with an admin stats page.

**Architecture:** Static single-file frontend (`index.html`, React + Babel in-browser, no build step) on GitHub Pages, forked from `..\Tech Spotlight Generator\index.html`. Serverless backend in `api/` (Vercel functions, ESM) proxies OpenAI and writes analytics to Neon Postgres. A standalone `stats.html` renders admin analytics. Spec: `docs/superpowers/specs/2026-07-08-springboard-design.md`.

**Tech Stack:** React 18 + Babel standalone (CDN, SRI-pinned), PptxGenJS, qrcode, JSZip, pdf.js (all carried over), Vercel Node serverless functions, `@neondatabase/serverless`, `node --test` for backend tests.

## Global Constraints

- Product name: **Springboard**. Version starts at **0.1.0**.
- No secrets in the repo, ever. `OPENAI_API_KEY`, `OPENAI_MODEL`, `TEACHER_PASSCODE`, `ADMIN_PASSWORD`, `DATABASE_URL` live only in Vercel env vars.
- Frontend stays a single static `index.html` with no build step; CDN libraries pinned to exact versions with SRI (keep the fork's existing `<script>` tags untouched unless a task says otherwise).
- Slides carry **minimal text**; all detailed guidance goes in the PPTX **Notes pane**.
- Teacher notes are **always English** (Phase 1 is English-only overall; Immersion is Phase 2).
- The AI must **never invent official curriculum codes**; teacher-pasted outcomes are quoted as the alignment target.
- PptxGenJS: **never reuse an options/shadow object across calls** — build fresh object literals every call (known corruption trap).
- WCAG 2.1 AA: keep the fork's contrast, focus states, labels, keyboard operability; new UI must match.
- Backend events whitelist: `analyse`, `generate`, `regenerate`, `download`. Analytics is anonymous — no names, no PII.
- Working directory for all tasks: `c:\Users\BennN\Wesley College\College Digital Learning & Practice - Documents\Apps\Springboard` (git repo already initialised, `main` branch). The fork source is the sibling folder `..\Tech Spotlight Generator`.
- Commit after every task (small, conventional-commit messages). Do not push to GitHub — repo creation/push happens only in Task 16 after explicit user OK.
- Line anchors given for `index.html` refer to the **fork source** at commit `ddd20e8` of Tech Spotlight; after Task 1 the copy is identical, but line numbers drift as tasks edit it — locate by function name, not line, from Task 7 onward.

---

### Task 1: Scaffold the fork + UI compile checker

**Files:**
- Create: `index.html` (copy), `fonts/` (copy), `docs/pz-thinking-routines.md` (copy), `.gitignore`, `package.json`, `tools/compile-check.mjs`
- Test: `npm run check:ui`

**Interfaces:**
- Produces: `npm test` (backend tests, none yet), `npm run check:ui` (Babel-parses the inline JSX in `index.html`; used by every frontend task as the compile gate).

- [ ] **Step 1: Copy fork source**

```bash
cd "c:\Users\BennN\Wesley College\College Digital Learning & Practice - Documents\Apps\Springboard"
cp "../Tech Spotlight Generator/index.html" index.html
cp -r "../Tech Spotlight Generator/fonts" fonts
mkdir -p docs && cp "../Tech Spotlight Generator/docs/pz-thinking-routines.md" docs/
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.vercel/
.env
.env.*
*.local
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "springboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "check:ui": "node tools/compile-check.mjs"
  },
  "dependencies": {
    "@neondatabase/serverless": "0.10.4"
  },
  "devDependencies": {
    "@babel/core": "7.26.0",
    "@babel/preset-react": "7.26.3"
  }
}
```

- [ ] **Step 4: Create `tools/compile-check.mjs`**

```js
// Compile gate: extracts the inline <script type="text/babel"> block from
// index.html and runs it through Babel. Fails loudly on any JSX/JS syntax error.
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: no text/babel script block found"); process.exit(1); }
try {
  transformSync(m[1], { presets: [["@babel/preset-react", { runtime: "classic" }]], filename: "index.jsx" });
  console.log("OK: index.html JSX compiles");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
}
```

- [ ] **Step 5: Install and verify the gate passes on the untouched fork**

Run: `npm install && npm run check:ui`
Expected: `OK: index.html JSX compiles`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: fork Tech Spotlight index.html + fonts + PZ routines; add compile gate"
```

---

### Task 2: Backend shared lib (auth, CORS, DB handle) with tests

**Files:**
- Create: `api/_lib.js`, `api/_db.js`
- Test: `test/lib.test.js`

**Interfaces:**
- Produces (used by every `api/*.js` handler):
  - `safeEqual(a: string, b: string): boolean` — constant-time compare.
  - `applyCors(req, res): boolean` — sets CORS headers; returns `true` if the request was an OPTIONS preflight it already answered.
  - `requireTeacher(req, res): boolean` — checks header `x-sb-passcode` against `process.env.TEACHER_PASSCODE`; sends 401 and returns `false` on mismatch.
  - `requireAdmin(req, res): boolean` — same for header `x-sb-admin` vs `process.env.ADMIN_PASSWORD`.
  - `getSql(): tagged-template fn` / `setSqlForTests(fn): void` from `_db.js`.

Files starting with `_` in `api/` are not exposed as routes by Vercel.

- [ ] **Step 1: Write the failing tests**

```js
// test/lib.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { safeEqual, applyCors, requireTeacher, requireAdmin } from "../api/_lib.js";

export function mockReqRes({ method = "POST", headers = {}, body = {} } = {}) {
  const req = { method, headers, body };
  const res = {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; },
  };
  return { req, res };
}

test("safeEqual matches equal strings, rejects others", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("", "abc"), false);
  assert.equal(safeEqual(undefined, "abc"), false);
});

test("applyCors answers OPTIONS preflight and allows known origin", () => {
  const { req, res } = mockReqRes({ method: "OPTIONS", headers: { origin: "https://wesdlpteam.github.io" } });
  assert.equal(applyCors(req, res), true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://wesdlpteam.github.io");
});

test("applyCors does not set allow-origin for unknown origin", () => {
  const { req, res } = mockReqRes({ headers: { origin: "https://evil.example" } });
  assert.equal(applyCors(req, res), false);
  assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
});

test("requireTeacher 401s on wrong or missing passcode, passes on match", () => {
  process.env.TEACHER_PASSCODE = "test-pass";
  let m = mockReqRes({ headers: { "x-sb-passcode": "wrong" } });
  assert.equal(requireTeacher(m.req, m.res), false);
  assert.equal(m.res.statusCode, 401);
  m = mockReqRes({ headers: {} });
  assert.equal(requireTeacher(m.req, m.res), false);
  m = mockReqRes({ headers: { "x-sb-passcode": "test-pass" } });
  assert.equal(requireTeacher(m.req, m.res), true);
});

test("requireAdmin checks x-sb-admin against ADMIN_PASSWORD", () => {
  process.env.ADMIN_PASSWORD = "admin-pass";
  let m = mockReqRes({ headers: { "x-sb-admin": "nope" } });
  assert.equal(requireAdmin(m.req, m.res), false);
  assert.equal(m.res.statusCode, 401);
  m = mockReqRes({ headers: { "x-sb-admin": "admin-pass" } });
  assert.equal(requireAdmin(m.req, m.res), true);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../api/_lib.js'`

- [ ] **Step 3: Implement `api/_lib.js`**

```js
import crypto from "node:crypto";

const ALLOWED_ORIGINS = [
  "https://wesdlpteam.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
];

export function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ""));
  const B = Buffer.from(String(b ?? ""));
  if (A.length !== B.length || A.length === 0) return false;
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
```

- [ ] **Step 4: Implement `api/_db.js`**

```js
import { neon } from "@neondatabase/serverless";

let _sql = null;

export function getSql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

// Tests inject a fake tagged-template function here.
export function setSqlForTests(fn) { _sql = fn; }
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add api/_lib.js api/_db.js test/lib.test.js
git commit -m "feat(api): shared auth/CORS lib + injectable DB handle, with tests"
```

---

### Task 3: `api/generate.js` — OpenAI chat proxy

**Files:**
- Create: `api/generate.js`
- Test: `test/generate.test.js`

**Interfaces:**
- Consumes: `applyCors`, `requireTeacher` from Task 2.
- Produces: `POST /api/generate` with header `x-sb-passcode`, JSON body `{ messages, response_format?, max_completion_tokens?, temperature? }`. Returns the **raw OpenAI chat-completions JSON** (so the forked frontend's parsing code keeps working unchanged). Model is fixed server-side: `process.env.OPENAI_MODEL || "gpt-5.4"`.

- [ ] **Step 1: Write the failing tests**

```js
// test/generate.test.js
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/generate.js";
import { mockReqRes } from "./lib.test.js";

process.env.TEACHER_PASSCODE = "test-pass";
process.env.OPENAI_API_KEY = "sk-test";

test("rejects non-POST", async () => {
  const { req, res } = mockReqRes({ method: "GET" });
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});

test("rejects wrong passcode", async () => {
  const { req, res } = mockReqRes({ headers: { "x-sb-passcode": "wrong" }, body: { messages: [{ role: "user", content: "hi" }] } });
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test("rejects missing messages", async () => {
  const { req, res } = mockReqRes({ headers: { "x-sb-passcode": "test-pass" }, body: {} });
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test("forwards to OpenAI with server-side model and returns raw JSON", async () => {
  let sent = null;
  globalThis.fetch = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization };
    return { json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };
  const { req, res } = mockReqRes({
    headers: { "x-sb-passcode": "test-pass" },
    body: { messages: [{ role: "user", content: "hi" }], temperature: 0.4, model: "gpt-99-hax" },
  });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(sent.auth, "Bearer sk-test");
  assert.notEqual(sent.body.model, "gpt-99-hax"); // client cannot pick the model
  assert.equal(sent.body.temperature, 0.4);
  assert.equal(res.body.choices[0].message.content, "ok");
});
```

- [ ] **Step 2: Run tests, verify the new file's tests fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../api/generate.js'`

- [ ] **Step 3: Implement `api/generate.js`**

```js
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
  if (max_completion_tokens) payload.max_completion_tokens = max_completion_tokens;
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
    return res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add api/generate.js test/generate.test.js
git commit -m "feat(api): passcode-gated OpenAI chat proxy with fixed server-side model"
```

---

### Task 4: `api/transcribe.js` — audio transcription proxy

**Files:**
- Create: `api/transcribe.js`
- Test: `test/transcribe.test.js`

**Interfaces:**
- Consumes: `applyCors`, `requireTeacher`.
- Produces: `POST /api/transcribe`, headers `x-sb-passcode` + `x-sb-filename` (e.g. `clip.wav`), raw body = WAV bytes (`Content-Type: application/octet-stream`). Forwards to OpenAI `audio/transcriptions` with model `gpt-4o-transcribe`; returns OpenAI's JSON (`{ text: ... }`). Frontend (Task 7) sends raw bytes instead of multipart. Vercel body limit ≈ 4.5 MB ⇒ ~2 min of 16 kHz mono WAV; the fork already trims/truncates transcripts, keep that behaviour client-side.

- [ ] **Step 1: Write the failing tests**

```js
// test/transcribe.test.js
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/transcribe.js";

process.env.TEACHER_PASSCODE = "test-pass";
process.env.OPENAI_API_KEY = "sk-test";

// req must be an async-iterable (stream) because bodyParser is disabled
function streamReq({ method = "POST", headers = {}, chunks = [] } = {}) {
  return {
    method, headers,
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield Buffer.from(c); },
  };
}
function mockRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; },
  };
}

test("rejects wrong passcode", async () => {
  const res = mockRes();
  await handler(streamReq({ headers: { "x-sb-passcode": "wrong" } }), res);
  assert.equal(res.statusCode, 401);
});

test("forwards audio bytes to OpenAI and returns its JSON", async () => {
  let sentUrl = null;
  globalThis.fetch = async (url, opts) => {
    sentUrl = url;
    assert.ok(opts.body instanceof FormData);
    return { json: async () => ({ text: "hello world" }) };
  };
  const res = mockRes();
  await handler(streamReq({
    headers: { "x-sb-passcode": "test-pass", "x-sb-filename": "clip.wav" },
    chunks: ["RIFF....WAVEdata"],
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(sentUrl, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(res.body.text, "hello world");
});
```

- [ ] **Step 2: Run tests, verify FAIL** (`Cannot find module '../api/transcribe.js'`)

- [ ] **Step 3: Implement `api/transcribe.js`**

```js
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
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add api/transcribe.js test/transcribe.test.js
git commit -m "feat(api): audio transcription proxy (raw-body, passcode-gated)"
```

---

### Task 5: Analytics schema + `api/log.js`

**Files:**
- Create: `db/schema.sql`, `api/log.js`
- Test: `test/log.test.js`

**Interfaces:**
- Consumes: `applyCors`, `requireTeacher`, `getSql`/`setSqlForTests`.
- Produces: `POST /api/log`, header `x-sb-passcode`, JSON body `{ event, stimulusType?, curriculum?, subject?, yearLevel?, routine?, boosters?, languageMode?, topic? }`. `event` must be one of `analyse | generate | regenerate | download`. Inserts one row into `events`. Returns `{ ok: true }`.

- [ ] **Step 1: Create `db/schema.sql`** (run manually against Neon in Task 16)

```sql
CREATE TABLE IF NOT EXISTS events (
  id         SERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  event      TEXT NOT NULL,
  stimulus_type TEXT,
  curriculum TEXT,
  subject    TEXT,
  year_level TEXT,
  routine    TEXT,
  boosters   TEXT,
  language_mode TEXT,
  topic      TEXT
);
CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts);
CREATE INDEX IF NOT EXISTS events_event_idx ON events (event);
```

- [ ] **Step 2: Write the failing tests**

```js
// test/log.test.js
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/log.js";
import { setSqlForTests } from "../api/_db.js";
import { mockReqRes } from "./lib.test.js";

process.env.TEACHER_PASSCODE = "test-pass";

test("rejects unknown event", async () => {
  const { req, res } = mockReqRes({ headers: { "x-sb-passcode": "test-pass" }, body: { event: "hacked" } });
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test("rejects wrong passcode", async () => {
  const { req, res } = mockReqRes({ headers: { "x-sb-passcode": "no" }, body: { event: "generate" } });
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test("inserts a clipped row for a valid event", async () => {
  let captured = null;
  setSqlForTests(async (strings, ...values) => { captured = values; return []; });
  const { req, res } = mockReqRes({
    headers: { "x-sb-passcode": "test-pass" },
    body: { event: "generate", curriculum: "IB MYP", subject: "Science", yearLevel: "8",
            routine: "See, Think, Wonder", boosters: "curiosityGapTitle,leadWithStory",
            languageMode: "english", stimulusType: "image", topic: "x".repeat(500) },
  });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(captured[0], "generate");
  assert.equal(captured[8].length, 300); // topic clipped to 300 chars
});
```

- [ ] **Step 3: Run tests, verify FAIL** (`Cannot find module '../api/log.js'`)

- [ ] **Step 4: Implement `api/log.js`**

```js
import { applyCors, requireTeacher } from "./_lib.js";
import { getSql } from "./_db.js";

const EVENTS = new Set(["analyse", "generate", "regenerate", "download"]);
const clip = (v) => (v == null || v === "" ? null : String(v).slice(0, 300));

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireTeacher(req, res)) return;

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
    return res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 5: Run tests, verify PASS**

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql api/log.js test/log.test.js
git commit -m "feat(api): anonymous analytics event logging + events schema"
```

---

### Task 6: `api/stats.js` — admin aggregates

**Files:**
- Create: `api/stats.js`
- Test: `test/stats.test.js`

**Interfaces:**
- Consumes: `applyCors`, `requireAdmin`, `getSql`/`setSqlForTests`.
- Produces: `POST /api/stats`, header `x-sb-admin`. Returns:

```json
{
  "totals":      [{ "event": "generate", "n": 42 }],
  "byDay":       [{ "day": "2026-07-01", "n": 5 }],
  "byCurriculum":[{ "curriculum": "IB MYP", "n": 12 }],
  "bySubject":   [{ "subject": "Science", "n": 9 }],
  "byRoutine":   [{ "routine": "See, Think, Wonder", "n": 7 }],
  "byStimulus":  [{ "stimulus_type": "image", "n": 20 }],
  "recent":      [{ "ts": "2026-07-01 09:00", "topic": "…", "curriculum": "…", "subject": "…", "year_level": "…", "routine": "…" }]
}
```

- [ ] **Step 1: Write the failing tests**

```js
// test/stats.test.js
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/stats.js";
import { setSqlForTests } from "../api/_db.js";
import { mockReqRes } from "./lib.test.js";

process.env.ADMIN_PASSWORD = "admin-pass";

test("rejects wrong admin password", async () => {
  const { req, res } = mockReqRes({ headers: { "x-sb-admin": "no" } });
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test("returns all seven aggregate blocks", async () => {
  setSqlForTests(async () => [{ stub: 1 }]); // every query returns a stub row
  const { req, res } = mockReqRes({ headers: { "x-sb-admin": "admin-pass" } });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  for (const k of ["totals", "byDay", "byCurriculum", "bySubject", "byRoutine", "byStimulus", "recent"]) {
    assert.ok(Array.isArray(res.body[k]), `missing block: ${k}`);
  }
});
```

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement `api/stats.js`**

```js
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
    return res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add api/stats.js test/stats.test.js
git commit -m "feat(api): admin-gated analytics aggregates endpoint"
```

---

### Task 7: Frontend — passcode replaces API key; calls go through the backend

**Files:**
- Modify: `index.html` — anchors (fork line numbers): `transcribeMedia` (~1109), `generateSpotlight` fetch (~1238), `suggestThemeFromStimulus` fetch (~1327), `App` state (~1493–1497), settings panel API-key input (~2401–2404), guard messages at ~1844/1865/1928, media transcribe trigger (~1757/1775)

**Interfaces:**
- Produces (used by all later frontend tasks):
  - `const API_BASE` — top of the babel script, next to other constants:
    ```js
    const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:")
      ? "http://localhost:3000"           // `vercel dev` during development
      : "https://SPRINGBOARD-API.vercel.app"; // real URL substituted in Task 16
    ```
  - `passcode` React state + localStorage key `"sb_passcode"` (replaces the fork's `KEY_STORE` API-key storage).
  - Every OpenAI fetch replaced by `fetch(API_BASE + "/api/generate", …)` with header `"x-sb-passcode": passcode` — **request/response JSON shape unchanged**, so existing parsing code stays.

- [ ] **Step 1: Swap chat-completion calls.** In `generateSpotlight` and `suggestThemeFromStimulus`, replace

```js
fetch("https://api.openai.com/v1/chat/completions", {
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey }, ...
```

with

```js
fetch(API_BASE + "/api/generate", {
  headers: { "Content-Type": "application/json", "x-sb-passcode": passcode }, ...
```

Remove `model` from the client payload (server pins it). Rename the `apiKey` parameter to `passcode` through both functions' signatures and call sites.

- [ ] **Step 2: Swap transcription call.** In `transcribeMedia`, replace the multipart upload to `api.openai.com/v1/audio/transcriptions` with:

```js
const wavBlob = /* existing 16k WAV blob produced by videoFileToWav16k */;
const r = await fetch(API_BASE + "/api/transcribe", {
  method: "POST",
  headers: { "x-sb-passcode": passcode, "x-sb-filename": file.name.replace(/\.[^.]+$/, "") + ".wav", "Content-Type": "application/octet-stream" },
  body: wavBlob,
});
```

- [ ] **Step 3: Swap stored credential.** In `App`: rename `apiKey`→`passcode`, `saveApiKey`→`savePasscode`, storage key to `"sb_passcode"`. Settings UI: label "School passcode", input `type="password"`, hint text: *"Ask the Digital Learning team for the passcode. Saved in this browser only — Forget clears it."* `forgetAll` now only clears the passcode (SharePoint disconnect logic is deleted in Task 8 — leave it compiling for now by keeping the function body's remaining lines valid). Remove the model `<select>` UI and `model` state entirely.

- [ ] **Step 4: Update guard messages.** Replace all `"Please paste your OpenAI API key first."` with `"Enter the school passcode first."`. On any 401 from the backend, show `"Passcode incorrect — check with the Digital Learning team."` (add this to the shared error handling where the response JSON `error` field is surfaced).

- [ ] **Step 5: Compile gate**

Run: `npm run check:ui`
Expected: `OK: index.html JSX compiles`

- [ ] **Step 6: Live smoke test (local).** Run `npx vercel dev` (or `npx serve .` for UI-only) with a `.env` containing test values; open `http://localhost:3000`, enter passcode, confirm a text-stimulus generation round-trips through `/api/generate`. If OpenAI access isn't available locally, verify the request fires with correct headers in DevTools Network tab and the 401 path shows the friendly message.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(ui): school passcode + backend proxy replace user API key and model picker"
```

---

### Task 8: Strip SharePoint machinery + rebrand to Springboard

**Files:**
- Modify: `index.html` — delete: `idbOpen/idbSaveHandle/idbLoadHandle/idbDeleteHandle` (~638–654), `sharePointFileName` (~666), `putVideoToSharePoint` (~674), `readThemesFile`/`writeThemesFile` (~688–699), `pickThemesFolder`/`syncThemesFromFolder` (~1583–1589), `connectMediaFolder` (~1613), `connectLessonsFolder` (~1627), `folderWritable` (~1640), `lessonFileName` (~1645), `saveLessonToSharePoint` (~1657), `bandSpCode` (~611), `stampDocProps` SharePoint-column specifics (keep the function — Task 12 re-uses it for Tags), and every JSX block/button that references them (search: `SharePoint`, `Lessons folder`, `Media folder`, `themes.json`).

- [ ] **Step 1: Delete the functions and UI listed above.** After each removal batch, run `npm run check:ui` to catch dangling references (search for the removed names before compiling).

- [ ] **Step 2: Rebrand strings.** Title/header/footer: "Digital Spotlight Generator"→"**Springboard**"; tagline: "*Launch student thinking — stimulus to slides in two minutes.*" `<title>Springboard</title>`. Version string → `0.1.0`. Keep Wesley colours/fonts as-is for now.

- [ ] **Step 3: Simplify `forgetAll`** to only clear the passcode:

```js
function forgetAll() { savePasscode(""); }
```

- [ ] **Step 4: Compile gate + eyeball.** `npm run check:ui` then open the page: no SharePoint buttons anywhere, download still offered after generation.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(ui): remove SharePoint machinery; rebrand as Springboard v0.1.0"
```

---

### Task 9: Class settings panel (curriculum / subject / year / outcome)

**Files:**
- Modify: `index.html` — replace the band-checkbox + theme-preset UI (anchors: `bandLabelOf` ~549, `normalizeThemes`/`loadCachedThemes`/`saveCachedThemes` ~583–604, `comboBandLabel` ~617, `applyThemes`/`addTheme`/`removeTheme` ~1566–1605, `toggleBand`/`setBandYear` ~1697–1702, `suggestTheme` ~1842, and their JSX)

**Interfaces:**
- Produces (consumed by Tasks 10, 11, 13):
  ```js
  const CURRICULA = ["VCE", "IB PYP", "IB MYP", "IB DP", "Australian Curriculum", "Custom"];
  // React state in App:
  const [classInfo, setClassInfo] = useState(() => loadClassInfo());
  // shape: { curriculum: "IB MYP", subject: "", yearLevel: "", outcome: "" }
  // persisted to localStorage key "sb_class"
  function bandOf(yearLevel) {
    const s = String(yearLevel);
    const n = parseInt(s.replace(/\D/g, ""), 10);
    if (/prep|foundation|^k$/i.test(s.trim()) || (!Number.isNaN(n) && n <= 6)) return "younger"; // Prep–Y6
    if (!Number.isNaN(n) && n <= 9) return "middle";                                             // Y7–9
    return "senior";                                                                             // Y10–12 (default)
  }
  ```

- [ ] **Step 1: Delete the theme system** (functions + presets + "Suggest theme" button + theme chips JSX) and the multi-band checkbox UI. The generator becomes single-class per run.

- [ ] **Step 2: Add the settings panel JSX** in place of the removed block (match existing form styling classes):

```jsx
<div className="field-row">
  <label htmlFor="f-curr">Curriculum</label>
  <select id="f-curr" value={classInfo.curriculum}
          onChange={e => saveClassInfo({ ...classInfo, curriculum: e.target.value })}>
    {CURRICULA.map(c => <option key={c} value={c}>{c}</option>)}
  </select>
</div>
<div className="field-row">
  <label htmlFor="f-subj">Subject</label>
  <input id="f-subj" type="text" placeholder="e.g. Science, English, Humanities"
         value={classInfo.subject} onChange={e => saveClassInfo({ ...classInfo, subject: e.target.value })} />
</div>
<div className="field-row">
  <label htmlFor="f-year">Year level</label>
  <input id="f-year" type="text" placeholder="e.g. Prep, 4, 8, 11"
         value={classInfo.yearLevel} onChange={e => saveClassInfo({ ...classInfo, yearLevel: e.target.value })} />
</div>
<div className="field-row">
  <label htmlFor="f-outcome">Outcome or topic (optional — paste from your planner)</label>
  <textarea id="f-outcome" rows={2}
            placeholder="e.g. 'Students analyse how text structures shape meaning' or 'Unit: Body systems'"
            value={classInfo.outcome} onChange={e => saveClassInfo({ ...classInfo, outcome: e.target.value })} />
</div>
```

with `loadClassInfo`/`saveClassInfo` reading/writing localStorage `"sb_class"` (same try/catch pattern as the old theme cache; default `{ curriculum: "IB MYP", subject: "", yearLevel: "", outcome: "" }`).

- [ ] **Step 3: Add `bandOf`** (code above) near the old `bandLabelOf` site; update `inputReady` (~1835) to require a stimulus + non-empty `subject` and `yearLevel`.

- [ ] **Step 4: Compile gate + eyeball.** `npm run check:ui`; open page, fill panel, values survive a reload.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ui): class settings panel (curriculum/subject/year/outcome) replaces bands+themes"
```

---

### Task 10: Routine dataset + Analyse step (recommendations + boosters)

**Files:**
- Modify: `index.html`
- Source data: `docs/pz-thinking-routines.md` (in repo)

**Interfaces:**
- Produces (consumed by Task 11):
  ```js
  // Every routine from docs/pz-thinking-routines.md, transcribed mechanically — ALL of them (~90).
  const ROUTINES = [
    { name: "See, Think, Wonder", url: "https://pz.harvard.edu/resources/see-think-wonder",
      gist: "Observe closely, interpret what might be going on, pose wonderings.",
      bands: ["younger", "middle", "senior"], group: "Core observation and inquiry" },
    { name: "Think, Puzzle, Explore", url: "https://pz.harvard.edu/resources/think-puzzle-explore",
      gist: "Activate prior knowledge, surface puzzles, plan exploration.",
      bands: ["younger", "middle", "senior"], group: "Core observation and inquiry" },
    // … one entry per routine in the doc; bands: tag "(For Younger Children)" variants ["younger"],
    // complexity/truth-and-evidence routines ["middle","senior"], others all three — reuse the fork's
    // per-band curated arrays (Tech Spotlight v1.11 band lists, still present in the copied file) as the band source.
  ];

  const BOOSTERS = [
    { id: "curiosityGapTitle", label: "Curiosity-gap title", line: "Write the title so it opens a curiosity gap — pose what we don't yet know (Made to Stick: Unexpected)." },
    { id: "concreteQuestion",  label: "Concrete question",   line: "Make the provocative question concrete and sensory — people, actions, things, not abstractions (Concrete)." },
    { id: "leadWithStory",     label: "Lead with the story", line: "Frame the stimulus as a story with a protagonist and stakes (Stories)." },
    { id: "unexpectedFact",    label: "Unexpected fact",     line: "Surface the most schema-breaking fact in the stimulus early (Unexpected)." },
    { id: "humanScaleStat",    label: "Human-scale numbers", line: "Re-express any statistic at human scale (Credible)." },
    { id: "emotionalHook",     label: "Emotional hook",      line: "Connect to something students already care about — identity or self-interest (Emotional)." },
  ];

  async function analyseStimulus({ passcode, mode, media, sourceText, classInfo })
  // → { summary: string, routines: [{ name, why }, ×3], boosters: [id, id, id] }
  // React state: analysis, selectedRoutine (name string), boostersOn (Set of ids)
  ```

- [ ] **Step 1: Add `ROUTINES` and `BOOSTERS` constants.** Transcribe **every** routine from `docs/pz-thinking-routines.md` following the schema above (name, url, one-line gist compressed from the doc, bands, group = the doc's section heading). This is mechanical but long — do not sample or skip entries.

- [ ] **Step 2: Add `analyseStimulus`.** Model it on `suggestThemeFromStimulus` (same media-parts packaging), with this prompt core:

```js
const routineMenu = ROUTINES.filter(r => r.bands.includes(bandOf(classInfo.yearLevel)))
  .map(r => `- ${r.name}: ${r.gist}`).join("\n");
const sys = `You help a ${classInfo.curriculum} teacher of ${classInfo.subject}, year ${classInfo.yearLevel}, launch student thinking from a stimulus.
Return STRICT JSON only: {"summary": string (<=40 words, what the stimulus shows),
"routines": [{"name": string, "why": string (<=20 words, why it fits THIS stimulus and age group)} x3],
"boosters": [2-3 ids from: ${BOOSTERS.map(b => b.id).join(", ")}]}
Routine names MUST be copied exactly from this menu:\n${routineMenu}`;
```

Validate the reply: keep only routine names that exist in `ROUTINES` (case-insensitive match, then canonicalise); if fewer than 3 valid, top up from the band-filtered list. Parse with the fork's `parseJsonLoose`.

- [ ] **Step 3: Add the Analyse UI between settings and generation.** "Analyse stimulus" button (enabled when `inputReady()`), then: summary line, three routine cards (name, why, radio-select, link to `url` opening in new tab), a "Browse all routines" disclosure listing the band-filtered `ROUTINES` grouped by `group` (each selectable), and booster toggle chips (recommended ones on, others available off). Selecting a card sets `selectedRoutine`; Generate button stays disabled until a routine is selected.

- [ ] **Step 4: Compile gate + live check.** `npm run check:ui`; in the browser, analyse a pasted paragraph and confirm 3 valid cards + booster chips render, radio selection works by keyboard (arrow keys / space), focus visible.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ui): full PZ routine dataset, analyse step with routine cards + stickiness boosters"
```

---

### Task 11: Generation — 4-slide deck model, prompt, editable preview, per-slide regenerate

**Files:**
- Modify: `index.html` — rework `generateSpotlight`→`generateSpringboard` (~1137), `shapeDeck` (~1055), `generate` (~1862), `regenerateSlide` (~1926), the preview JSX and field patch helpers (~1947–1963), `mergeScopedFields` (~1272)

**Interfaces:**
- Produces (consumed by Tasks 12–14):

```js
// Deck JSON — the single source of truth for preview and export:
{
  "title": "string (<=8 words, stickiness-boosted)",
  "keywords": ["3-6 search keywords"],
  "ignite":  { "question": "one provocative question" },
  "think":   { "routine": "exact ROUTINES name", "steps": ["<=4 short student prompts"], "structure": "how to run it, e.g. 'Think-pair-share, 3 min'" },
  "launch":  { "connection": "<=25 words curriculum connection", "bridge": "<=20 words from stimulus to today's lesson", "question": "the lesson launch question" },
  "reflect": { "revisit": "<=15 words revisiting the ignite question", "prompts": ["I used to think…", "Now I think…"] },
  "notes":   { "ignite": "string", "think": "string", "launch": "string", "reflect": "string" },
  "advisory": { "flag": false, "reason": "" }
}
// React state: deck (object above), includeReflect (bool, default true)
// generateSpringboard({ passcode, mode, media, sourceText, classInfo, routineName, boosterIds, scope, current })
//   scope: "all" | "ignite" | "think" | "launch" | "reflect"  — single-slide regenerate reuses it
```

- [ ] **Step 1: Write the new prompt inside `generateSpringboard`** (replacing the Spotlight prompt; keep the existing media-part packaging and `parseJsonLoose`):

```js
const routine = ROUTINES.find(r => r.name === routineName);
const boosterLines = BOOSTERS.filter(b => boosterIds.includes(b.id)).map(b => "- " + b.line).join("\n");
const outcomeLine = classInfo.outcome.trim()
  ? `ALIGN the launch slide to this exact outcome/topic, quoting its key phrases: "${classInfo.outcome.trim()}". Do not invent curriculum codes.`
  : `Write the curriculum connection in plain language for ${classInfo.curriculum} ${classInfo.subject}, year ${classInfo.yearLevel}. Never invent official curriculum codes or identifiers.`;
const tone = { younger: "concrete, playful, inquiry-led (ages 5-12)",
               middle: "analytical, real-world (ages 12-15)",
               senior: "critical, ethical, conceptual (ages 15-18)" }[bandOf(classInfo.yearLevel)];
const sys = `You create a 4-part lesson launch ("Springboard") from a teacher's stimulus.
Audience tone: ${tone}. Slides carry MINIMAL text — every field respects its word limit.
Thinking routine to scaffold the THINK part: "${routine.name}" — ${routine.gist} (${routine.url}).
Stickiness requirements:\n${boosterLines || "- none"}
${outcomeLine}
Each notes field is a teacher script with EXACTLY these labelled sections, each 1-3 sentences:
FACILITATION: … TIMING: … DIFFERENTIATION: … CURRICULUM LINKS: … EXTENSIONS: …
Set advisory.flag true only for sensitive themes (grief, violence, body image, etc.) with a one-line reason.
Return STRICT JSON with keys: title, keywords, ignite{question}, think{routine, steps, structure}, launch{connection, bridge, question}, reflect{revisit, prompts}, notes{ignite, think, launch, reflect}, advisory{flag, reason}.`;
```

For `scope !== "all"`, append: `Regenerate ONLY the "${scope}" and "notes.${scope}" fields; copy every other field verbatim from: ${JSON.stringify(current)}` — and adapt the fork's `mergeScopedFields` to the new schema so only the scoped fields are merged.

- [ ] **Step 2: Rewrite `shapeDeck`** to validate/default the new schema (arrays trimmed to limits, missing fields defaulted to empty strings/arrays, `think.routine` forced to `routineName`).

- [ ] **Step 3: Rebuild the preview** as four editable cards (IGNITE / THINK / LAUNCH / REFLECT) reusing the fork's inline-edit field pattern and `RegenButton` per card. Add the REFLECT toggle:

```jsx
<label className="toggle-row">
  <input type="checkbox" checked={includeReflect} onChange={e => setIncludeReflect(e.target.checked)} />
  Include REFLECT slide (revisit thinking at lesson end)
</label>
```

Each card also shows a collapsed "Teacher notes" `<details>` block with an editable textarea bound to `deck.notes.<slide>`. Show the advisory banner + include-toggle when `deck.advisory.flag`.

- [ ] **Step 4: Compile gate + live generation.** `npm run check:ui`; generate from a pasted article and an image; confirm all 4 cards fill, editing persists, single-slide regenerate only changes its card.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ui): 4-slide Springboard generation with notes, boosters, per-slide regenerate"
```

---

### Task 12: PPTX export — 4 slides, Wesley-light, Notes pane

**Files:**
- Modify: `index.html` — `buildDeckBlob` (~1977), `buildAndSaveDeck` (~2310), `stampDocProps` (~489)

**Interfaces:**
- Consumes: `deck`, `includeReflect`, `classInfo`, media reel machinery (`injectOnlineVideos`, `makeTexture`, `MediaCarousel` data), existing `addNotes` usage (~2278) as the pattern for notes.
- Produces: `buildDeckBlob({ deck, includeReflect, classInfo, media, link })` → Blob. Filename: `Springboard – <title> – <subject> Y<year>.pptx`.

- [ ] **Step 1: Replace the 4 deck styles with one Wesley-light layout.** Delete the style-picker UI and style-specific branches. Layout spec:
  - **IGNITE**: full Wesley treatment — purple header band (existing brand token in the fork), crest, big title, embedded stimulus (reuse the fork's image reel / video embed / QR+link code paths verbatim), the provocative question in gold accent.
  - **THINK / LAUNCH / REFLECT**: white background, thin purple top rule, small crest top-right, generous whitespace. THINK: routine name as kicker + steps as ≤4 short lines + structure line. LAUNCH: connection, bridge, question (question visually dominant). REFLECT: revisit line + the two sentence-starter prompts, large.
  - Build **fresh object literals for every `addText`/`addImage`/shadow option** — never share/reuse an options object (corruption trap).

- [ ] **Step 2: Write Notes pane on every slide** via `slide.addNotes(...)`: the slide's `deck.notes.<name>` string, prefixed with a one-line header, e.g. `IGNITE — run this in the first minute.` Keywords list is appended to the IGNITE notes (search benefit).

- [ ] **Step 3: Honour `includeReflect`** (skip slide 4 when off) and the advisory slide toggle (insert the fork's advisory slide, restyled Wesley-light, before IGNITE when accepted).

- [ ] **Step 4: Doc properties.** `stampDocProps`: Title = deck title; Tags = keywords + routine + curriculum; Subject = `${classInfo.curriculum} ${classInfo.subject} Y${classInfo.yearLevel}`; Company = "Wesley College".

- [ ] **Step 5: Verify with the PowerPoint COM oracle** (deck must actually open — this catches corrupt XML):

```powershell
$pp = New-Object -ComObject PowerPoint.Application
$pres = $pp.Presentations.Open("C:\full\path\to\downloaded.pptx", $true, $false, $false)
"slides: $($pres.Slides.Count); notes on 1: $($pres.Slides.Item(1).NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text.Length) chars"
$pres.Close(); $pp.Quit()
```

Expected: `slides: 4` (or 3 with REFLECT off; +1 with advisory on) and a non-zero notes length. Check notes render in PowerPoint's Notes pane manually once.

- [ ] **Step 6: Compile gate, then commit**

```bash
npm run check:ui
git add index.html
git commit -m "feat(export): Wesley-light 4-slide PPTX with teacher notes in Notes pane"
```

---

### Task 13: Analytics client wiring

**Files:**
- Modify: `index.html` — call sites: end of `analyseStimulus` success, end of `generate` success, end of `regenerateSlide` success, inside `buildAndSaveDeck` after save.

**Interfaces:**
- Produces:

```js
function logEvent(event, extra = {}) {
  try {
    fetch(API_BASE + "/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sb-passcode": passcode },
      body: JSON.stringify({
        event,
        curriculum: classInfo.curriculum, subject: classInfo.subject, yearLevel: classInfo.yearLevel,
        languageMode: "english",
        ...extra, // stimulusType, routine, boosters, topic
      }),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}
```

Fire-and-forget: analytics must never block or break the teacher flow (no await at call sites).

- [ ] **Step 1: Add `logEvent`** inside `App` (needs `passcode`/`classInfo` in scope).

- [ ] **Step 2: Wire the four call sites** — `analyse` (extra: `stimulusType`), `generate` (extra: `stimulusType`, `routine: selectedRoutine`, `boosters: [...boostersOn].join(",")`, `topic: deck.title`), `regenerate` (extra: `routine`, `topic`), `download` (extra: `routine`, `topic`).

- [ ] **Step 3: Compile gate + network check.** `npm run check:ui`; in DevTools, confirm one `/api/log` POST per action with expected body; UI remains responsive if the endpoint is unreachable.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ui): fire-and-forget analytics events (analyse/generate/regenerate/download)"
```

---

### Task 14: `stats.html` — admin dashboard

**Files:**
- Create: `stats.html` (standalone static page, vanilla JS + inline SVG — no React, no CDN deps)

**Interfaces:**
- Consumes: `POST /api/stats` with `x-sb-admin` (Task 6 response shape). Same `API_BASE` logic as `index.html` (duplicate the constant — the two pages are independent).

- [ ] **Step 1: Build the page.** Structure:
  - Password gate: single password input + "View stats" button; password kept in `sessionStorage` (`"sb_admin"`) only; on 401 show "Wrong password." and clear it. Nothing renders until a 200.
  - Once loaded, render: totals strip (one tile per event type); line chart "PowerPoints generated per day (30d)" (`byDay`); horizontal bar charts for `byCurriculum`, `byRoutine` (top 10), `byStimulus`, `bySubject`; table of `recent` (time, topic, curriculum, subject, year, routine).
  - Charts: small hand-rolled SVG helpers (`barChart(el, rows, labelKey)`, `lineChart(el, rows)`) — axis labels, accessible `<title>` per mark, Wesley purple as the single series colour, muted gray gridlines, all text ≥12px with ≥4.5:1 contrast. (Consult the dataviz skill when building.)
  - Wesley-light styling consistent with `index.html` (copy its font-face + colour custom properties into a small inline `<style>`).
- [ ] **Step 2: Verify.** Serve locally with the backend running; wrong password → error; right password → all seven blocks render; empty DB renders "No data yet" placeholders rather than broken charts.
- [ ] **Step 3: Commit**

```bash
git add stats.html
git commit -m "feat(stats): admin-gated analytics dashboard page"
```

---

### Task 15: README + deployment runbook

**Files:**
- Create: `README.md`, `docs/DEPLOY.md`

- [ ] **Step 1: `README.md`** — what Springboard is (one paragraph from the spec), the 6-step teacher flow, privacy section (passcode in localStorage; stimulus content goes to OpenAI via the school backend; analytics are anonymous usage events — list the exact fields; no names collected), tech section (fork lineage, single-file frontend, Vercel API), and Phase 2 roadmap (Immersion, Word/PPTX input, advisory polish).

- [ ] **Step 2: `docs/DEPLOY.md`** — step-by-step runbook:
  1. Create GitHub repo `wesdlpteam/Springboard` (public), push `main`, enable Pages (root). **Gate: requires Nathan's explicit OK.**
  2. Create Vercel project from the repo; add Neon Postgres from the Vercel Marketplace (free tier); run `db/schema.sql` in the Neon SQL editor.
  3. Set env vars: `OPENAI_API_KEY`, `OPENAI_MODEL` (e.g. `gpt-5.4`), `TEACHER_PASSCODE`, `ADMIN_PASSWORD`, `DATABASE_URL` (auto-added by Neon integration).
  4. Substitute the real Vercel URL into `API_BASE` in `index.html` **and** `stats.html`; commit.
  5. Set a **monthly spending cap** on the OpenAI key (platform.openai.com → Limits).
  6. Smoke-test matrix (curl): OPTIONS preflight 200; `/api/generate` 401 without passcode, 200 with; `/api/log` 400 unknown event; `/api/stats` 401 without admin password, 200 with.
- [ ] **Step 3: Commit**

```bash
git add README.md docs/DEPLOY.md
git commit -m "docs: README + deployment runbook"
```

---

### Task 16: Deploy + final verification sweep

**Gate: ask Nathan for explicit OK before creating the public GitHub repo and Vercel project.**

- [ ] **Step 1: Execute `docs/DEPLOY.md`** end to end (repo, Pages, Vercel, Neon, env vars, `API_BASE` substitution, spend cap reminder to Nathan).
- [ ] **Step 2: Backend smoke matrix** (from DEPLOY.md) against the live URL — all six expectations green.
- [ ] **Step 3: Full live path** on the GitHub Pages URL in the debug Chrome rig: passcode → image stimulus → analyse → pick routine → toggle a booster → generate → edit a field → regenerate one slide → download.
- [ ] **Step 4: COM oracle** on the downloaded deck (Task 12 script): opens, correct slide count, notes present on all slides.
- [ ] **Step 5: Stats check:** open `stats.html`, log in, confirm the session's events appear (analyse/generate/regenerate/download rows and charts).
- [ ] **Step 6: A11y pass:** keyboard-only run of the full flow; focus visible on cards/toggles; axe or manual contrast spot-check on new UI.
- [ ] **Step 7: Tag + commit**

```bash
git add -A
git commit -m "chore: production API_BASE + deploy notes; v0.1.0"
git tag v0.1.0
```

---

## Self-Review Notes

- **Spec coverage:** flow steps 1–6 → Tasks 9–12 (stimulus handling carried by fork); 4 slides + notes → 11–12; REFLECT toggle → 11–12; Option C curriculum → 9 + 11 prompt; passcode/backend → 2–4, 7; analytics + stats → 5–6, 13–14; download-only → 8; branding B → 12; verification approach → 12, 16. Phase 2 items (Immersion, docx/pptx input, advisory *polish*) intentionally absent; basic advisory carry-over included in 12.
- **Deferred by design:** ROUTINES transcription references the in-repo source doc rather than inlining ~90 entries; frontend edits reference fork functions by name because the full 236 KB file cannot be inlined — executors must read the anchor site before editing.
- **Type consistency:** `classInfo {curriculum, subject, yearLevel, outcome}`, `bandOf()`, deck schema, `logEvent` extras, and stats response keys are used identically across Tasks 9–14.
