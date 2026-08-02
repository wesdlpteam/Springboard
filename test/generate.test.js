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

test("reasoning_effort is allowlisted, never passed through raw", async () => {
  const origFetch = globalThis.fetch;
  const sentFor = async (effort) => {
    let sent = null;
    globalThis.fetch = async (url, opts) => { sent = JSON.parse(opts.body); return { json: async () => ({ ok: true }) }; };
    const { req, res } = mockReqRes({
      headers: { "x-sb-passcode": "test-pass" },
      body: { messages: [{ role: "user", content: "hi" }], reasoning_effort: effort },
    });
    await handler(req, res);
    return sent;
  };
  try {
    assert.equal((await sentFor("low")).reasoning_effort, "low");
    assert.equal((await sentFor("high")).reasoning_effort, "high");
    // Anything off the list is dropped rather than forwarded — the endpoint runs in open mode.
    assert.equal("reasoning_effort" in (await sentFor("wildly-expensive")), false);
    assert.equal("reasoning_effort" in (await sentFor({ evil: true })), false);
    assert.equal("reasoning_effort" in (await sentFor(undefined)), false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("stream:true is only forwarded when the client asks for it", async () => {
  const origFetch = globalThis.fetch;
  try {
    let sent = null;
    globalThis.fetch = async (url, opts) => { sent = JSON.parse(opts.body); return { json: async () => ({ ok: true }) }; };
    const { req, res } = mockReqRes({
      headers: { "x-sb-passcode": "test-pass" },
      body: { messages: [{ role: "user", content: "hi" }] },
    });
    await handler(req, res);
    assert.equal("stream" in sent, false);      // default stays the plain JSON path
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("a streaming request relays the upstream chunks verbatim", async () => {
  const origFetch = globalThis.fetch;
  try {
    const chunks = ['data: {"choices":[{"delta":{"content":"{\\"ti"}}]}\n\n',
                    'data: {"choices":[{"delta":{"content":"tle\\":\\"x\\"}"}}]}\n\n',
                    "data: [DONE]\n\n"];
    let sent = null;
    globalThis.fetch = async (url, opts) => {
      sent = JSON.parse(opts.body);
      let i = 0;
      return {
        ok: true,
        body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) }) },
      };
    };
    const written = [];
    const { req, res } = mockReqRes({
      headers: { "x-sb-passcode": "test-pass" },
      body: { messages: [{ role: "user", content: "hi" }], stream: true },
    });
    res.writeHead = function (code, hdrs) { this.statusCode = code; Object.assign(this.headers, hdrs); return this; };
    res.write = (v) => { written.push(v); return true; };
    await handler(req, res);
    assert.equal(sent.stream, true);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["Content-Type"], /text\/event-stream/);
    assert.equal(res.headers["X-Accel-Buffering"], "no"); // or a proxy sits on the chunks
    assert.deepEqual(written, chunks);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("a streaming request that fails upstream still answers with JSON", async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: { message: "model is overloaded" } }) });
    const { req, res } = mockReqRes({
      headers: { "x-sb-passcode": "test-pass" },
      body: { messages: [{ role: "user", content: "hi" }], stream: true },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { error: "model is overloaded" });
  } finally {
    globalThis.fetch = origFetch;
  }
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
