import test from "node:test";
import assert from "node:assert/strict";
import handler, { injectStudyGuide, sliceAcLevel } from "../api/generate.js";
import { mockReqRes } from "./_helpers.js";

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

test("clamps client-controlled cost params (max_completion_tokens, temperature)", async () => {
  const origFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return { json: async () => ({ ok: true }) };
  };
  try {
    const { req, res } = mockReqRes({
      headers: { "x-sb-passcode": "test-pass" },
      body: { messages: [{ role: "user", content: "hi" }], max_completion_tokens: 100000, temperature: 9 },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(sent.max_completion_tokens, 8000); // clamped down from 100000
    assert.equal(sent.temperature, 2);              // clamped into [0,2]
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rejects an over-long messages array", async () => {
  const many = Array.from({ length: 21 }, () => ({ role: "user", content: "x" }));
  const { req, res } = mockReqRes({ headers: { "x-sb-passcode": "test-pass" }, body: { messages: many } });
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test("injects the matching AC year-level slice only", () => {
  const base = [{ role: "system", content: "SYS" }, { role: "user", content: "U" }];
  const out = injectStudyGuide(base, { key: "ac-mathematics", level: "4" });
  assert.ok(out[0].content.includes("AUSTRALIAN CURRICULUM v9 EXTRACT"));
  assert.ok(out[0].content.includes("## Year 4"));
  assert.ok(out[0].content.includes("AC9M4N01")); // real code from the sliced year
  assert.ok(!out[0].content.includes("## Year 5")); // neighbouring years stay out
  assert.equal(out[1].content, "U");
});

test("AC slice maps Prep to Foundation Year and years to bands", () => {
  const base = [{ role: "system", content: "SYS" }];
  const prep = injectStudyGuide(base, { key: "ac-english", level: "Prep" });
  assert.ok(prep[0].content.includes("## Foundation Year"));
  const banded = injectStudyGuide(base, { key: "ac-dance", level: "3" });
  assert.ok(banded[0].content.includes("## Years 3 and 4")); // Arts levels are banded
});

test("AC slice skips injection when the subject has no card for that year", () => {
  const base = [{ role: "system", content: "SYS" }];
  assert.deepEqual(injectStudyGuide(base, { key: "ac-history", level: "4" }), base);  // History is 7-10
  assert.deepEqual(injectStudyGuide(base, { key: "ac-hass-f-6", level: "8" }), base); // HASS F-6 stops at 6
  assert.deepEqual(injectStudyGuide(base, { key: "ac-mathematics", level: "11" }), base); // beyond F-10
});

test("sliceAcLevel keeps the guide header on the slice", () => {
  const text = "# T\n\nScope: s\n\n## Foundation Year\n\nfoo\n\n## Year 1\n\nbar\n";
  const sliced = sliceAcLevel(text, "1");
  assert.ok(sliced.startsWith("# T"));
  assert.ok(sliced.includes("bar") && !sliced.includes("foo"));
  assert.equal(sliceAcLevel(text, "nonsense"), null);
});

test("VCE unit slicing still works alongside AC guides", () => {
  const base = [{ role: "system", content: "SYS" }];
  const out = injectStudyGuide(base, { key: "biology", units: "1-2" });
  assert.ok(out[0].content.includes("VCE STUDY-DESIGN EXTRACT"));
  assert.ok(/Units 1[–-]2/.test(out[0].content));
});

test("forwards to OpenAI with server-side model and returns raw JSON", async () => {
  const origFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization };
    return { json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };
  try {
    const { req, res } = mockReqRes({
      headers: { "x-sb-passcode": "test-pass" },
      body: { messages: [{ role: "user", content: "hi" }], temperature: 0.4, model: "gpt-99-hax" },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(sent.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(sent.auth, "Bearer sk-test");
    assert.notEqual(sent.body.model, "gpt-99-hax"); // client cannot pick the model
    assert.equal(sent.body.model, "gpt-5.6-sol");
    assert.equal(sent.body.temperature, 0.4);
    assert.equal(res.body.choices[0].message.content, "ok");
  } finally {
    globalThis.fetch = origFetch;
  }
});
