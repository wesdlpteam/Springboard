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
  const origFetch = globalThis.fetch;
  let sentUrl = null;
  globalThis.fetch = async (url, opts) => {
    sentUrl = url;
    assert.ok(opts.body instanceof FormData);
    return { json: async () => ({ text: "hello world" }) };
  };
  try {
    const res = mockRes();
    await handler(streamReq({
      headers: { "x-sb-passcode": "test-pass", "x-sb-filename": "clip.wav" },
      chunks: ["RIFF....WAVEdata"],
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(sentUrl, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(res.body.text, "hello world");
  } finally {
    globalThis.fetch = origFetch;
  }
});
