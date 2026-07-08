import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/generate.js";
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
    assert.equal(sent.body.model, "gpt-5.4");
    assert.equal(sent.body.temperature, 0.4);
    assert.equal(res.body.choices[0].message.content, "ok");
  } finally {
    globalThis.fetch = origFetch;
  }
});
