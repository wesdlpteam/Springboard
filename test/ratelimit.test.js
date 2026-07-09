import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, __resetRateLimit, __setNowForTests } from "../api/_lib.js";
import { mockReqRes } from "./_helpers.js";

function makeReq(ip = "1.2.3.4") {
  return mockReqRes({ headers: { "x-forwarded-for": ip } });
}

test("allows up to max, blocks the next with 429 + Retry-After", () => {
  __resetRateLimit();
  __setNowForTests(() => 1000);
  const opts = { max: 3, windowMs: 60000, name: "rl-block" };
  for (let i = 0; i < 3; i++) {
    const { req, res } = makeReq();
    assert.equal(rateLimit(req, res, opts), true);
    assert.notEqual(res.statusCode, 429);
  }
  const { req, res } = makeReq();
  assert.equal(rateLimit(req, res, opts), false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], 60);
  assert.deepEqual(res.body, { error: "Too many requests, slow down." });
  __setNowForTests(null);
});

test("old timestamps expire, freeing the window", () => {
  __resetRateLimit();
  let now = 0;
  __setNowForTests(() => now);
  const opts = { max: 2, windowMs: 1000, name: "rl-expire" };
  const call = () => { const { req, res } = makeReq(); return { ok: rateLimit(req, res, opts), res }; };
  assert.equal(call().ok, true);   // t=0
  assert.equal(call().ok, true);   // t=0
  assert.equal(call().ok, false);  // t=0 -> blocked
  now = 1001;                      // both earlier hits now older than windowMs
  assert.equal(call().ok, true);   // window freed
  __setNowForTests(null);
});

test("limits are per client IP", () => {
  __resetRateLimit();
  __setNowForTests(() => 5000);
  const opts = { max: 1, windowMs: 60000, name: "rl-perip" };
  let m = makeReq("10.0.0.1");
  assert.equal(rateLimit(m.req, m.res, opts), true);
  m = makeReq("10.0.0.1");
  assert.equal(rateLimit(m.req, m.res, opts), false); // same IP blocked
  m = makeReq("10.0.0.2");
  assert.equal(rateLimit(m.req, m.res, opts), true);  // different IP fresh
  __setNowForTests(null);
});

test("takes the first x-forwarded-for hop, falls back to x-real-ip then unknown", () => {
  __resetRateLimit();
  __setNowForTests(() => 7000);
  const opts = { max: 1, windowMs: 60000, name: "rl-ip-parse" };
  // first hop "9.9.9.9" is the client; a proxy hop must not change the bucket
  let a = mockReqRes({ headers: { "x-forwarded-for": "9.9.9.9, 70.0.0.1" } });
  assert.equal(rateLimit(a.req, a.res, opts), true);
  let b = mockReqRes({ headers: { "x-forwarded-for": "9.9.9.9, 70.0.0.2" } });
  assert.equal(rateLimit(b.req, b.res, opts), false); // same first hop -> same bucket

  // no x-forwarded-for -> x-real-ip
  let c = mockReqRes({ headers: { "x-real-ip": "8.8.8.8" } });
  assert.equal(rateLimit(c.req, c.res, opts), true);
  let d = mockReqRes({ headers: { "x-real-ip": "8.8.8.8" } });
  assert.equal(rateLimit(d.req, d.res, opts), false);

  // neither header -> "unknown" bucket
  let e = mockReqRes({ headers: {} });
  assert.equal(rateLimit(e.req, e.res, opts), true);
  let f = mockReqRes({ headers: {} });
  assert.equal(rateLimit(f.req, f.res, opts), false);
  __setNowForTests(null);
});
