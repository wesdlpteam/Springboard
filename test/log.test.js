import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/log.js";
import { setSqlForTests } from "../api/_db.js";
import { mockReqRes } from "./_helpers.js";

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
