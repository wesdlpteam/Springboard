import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/stats.js";
import { setSqlForTests } from "../api/_db.js";
import { mockReqRes } from "./_helpers.js";

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
