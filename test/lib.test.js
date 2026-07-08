import test from "node:test";
import assert from "node:assert/strict";
import { safeEqual, applyCors, requireTeacher, requireAdmin } from "../api/_lib.js";
import { mockReqRes } from "./_helpers.js";

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

test("requireTeacher open mode: passes everyone when no TEACHER_PASSCODE is configured", () => {
  delete process.env.TEACHER_PASSCODE;
  const m = mockReqRes({ headers: {} }); // no passcode header either
  assert.equal(requireTeacher(m.req, m.res), true);
  assert.equal(m.res.statusCode, 0); // no 401 written
  process.env.TEACHER_PASSCODE = "test-pass"; // restore for any later tests
});

test("requireAdmin checks x-sb-admin against ADMIN_PASSWORD", () => {
  process.env.ADMIN_PASSWORD = "admin-pass";
  let m = mockReqRes({ headers: { "x-sb-admin": "nope" } });
  assert.equal(requireAdmin(m.req, m.res), false);
  assert.equal(m.res.statusCode, 401);
  m = mockReqRes({ headers: { "x-sb-admin": "admin-pass" } });
  assert.equal(requireAdmin(m.req, m.res), true);
});
