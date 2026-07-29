import test from "node:test";
import assert from "node:assert/strict";
import { mockReqRes } from "./_helpers.js";
import handler, {
  publicHttpUrl, extractLeadImageFromHtml, extractTitle, htmlToText, looksLikeBotWall, decodeEntities,
} from "../api/fetch-article.js";
import { __resetRateLimit } from "../api/_lib.js";

process.env.TEACHER_PASSCODE = "test-pass";
const OK = { "x-sb-passcode": "test-pass" };
const BASE = "https://example.org/news/story";

// A page shaped like the museum one that started this: no og:image, the real picture is a bare
// <img> in the body, plus site furniture that must not win.
const PAGE = `<!doctype html><html><head><title>Founding of Australia | Museum</title>
<meta name="description" content="A painting."></head><body>
<header><img src="/themes/logo.svg" alt="Logo"><img src="/icons/search.svg" alt=""></header>
<main><h1>Founding of Australia</h1>
<img src="/sites/default/files/1788_FirstFleet.jpg?v=1" alt="" role="presentation">
<p>Captain Arthur Phillip RN commanded the First Fleet of 11 ships that sailed into Botany Bay in
January 1788. Three days later he chose a site at Sydney Cove, and on 26 January began to establish
a convict settlement. This painting marked the sesquicentenary of that event.</p>
<script>var junk = "<img src=/nope.jpg>";</script></main>
<footer><img src="/copyright-banner.png" alt=""></footer></body></html>`;

function htmlResponse(body, { status = 200, type = "text/html; charset=utf-8" } = {}) {
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? type : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

test("publicHttpUrl blocks anything that isn't a public http host", () => {
  for (const bad of [
    "", "not a url", "file:///c:/secrets.txt", "ftp://example.org/a",
    "http://localhost/a", "http://127.0.0.1/a", "http://10.0.0.5/a", "http://192.168.1.1/a",
    "http://172.20.3.4/a", "http://169.254.169.254/latest/meta-data/", "http://[::1]/a",
    "http://box.internal/a", "http://100.100.1.1/a",
  ]) assert.equal(publicHttpUrl(bad), null, bad);
  assert.equal(publicHttpUrl("https://example.org/a?b=1").href, "https://example.org/a?b=1");
  assert.equal(publicHttpUrl("http://172.15.0.1/a")?.hostname, "172.15.0.1"); // just outside the private block
});

test("lead image prefers the body's real picture over site furniture", () => {
  assert.equal(extractLeadImageFromHtml(PAGE, BASE), "https://example.org/sites/default/files/1788_FirstFleet.jpg?v=1");
});

test("lead image uses og:image when the page has one", () => {
  const html = `<head><meta property="og:image" content="//cdn.example.org/lead.jpg"></head><body><img src="/other.jpg"></body>`;
  assert.equal(extractLeadImageFromHtml(html, BASE), "https://cdn.example.org/lead.jpg");
});

test("lead image skips svg, data URLs, tiny images and junk names", () => {
  const html = `<main><img src="/a/logo.png"><img src="/b/pic.svg"><img src="data:image/png;base64,AAA">
    <img src="/c/tracker.gif" width="1" height="1"><img src="/d/real-photo.jpg"></main>`;
  assert.equal(extractLeadImageFromHtml(html, BASE), "https://example.org/d/real-photo.jpg");
});

test("lead image takes the widest candidate from srcset", () => {
  const html = `<main><img srcset="/s/small.jpg 400w, /s/big.jpg 1600w" src="/s/small.jpg"></main>`;
  assert.equal(extractLeadImageFromHtml(html, BASE), "https://example.org/s/big.jpg");
});

test("htmlToText keeps the story and drops scripts and chrome", () => {
  const text = htmlToText(PAGE);
  assert.match(text, /Captain Arthur Phillip RN commanded/);
  assert.doesNotMatch(text, /var junk|<img/);
});

test("extractTitle and decodeEntities", () => {
  assert.equal(extractTitle(PAGE), "Founding of Australia | Museum");
  assert.equal(extractTitle(`<meta property="og:title" content="Real &amp; proper">`), "Real & proper");
  assert.equal(decodeEntities("Phillip&rsquo;s &#65;&#x42;"), "Phillip\u2019s AB");
});

test("looksLikeBotWall catches a Cloudflare challenge page", () => {
  assert.equal(looksLikeBotWall("Just a moment...", "This website uses a security service"), true);
  assert.equal(looksLikeBotWall("Founding of Australia", "Captain Arthur Phillip RN commanded"), false);
});

test("rejects a wrong passcode", async () => {
  __resetRateLimit();
  const { req, res } = mockReqRes({ headers: { "x-sb-passcode": "nope" }, body: { url: BASE } });
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test("rejects a non-public URL before any fetch", async () => {
  __resetRateLimit();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  try {
    const { req, res } = mockReqRes({ headers: OK, body: { url: "http://169.254.169.254/" } });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
  } finally { globalThis.fetch = origFetch; }
});

test("returns text, image and inline image bytes", async () => {
  __resetRateLimit();
  const origFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, opts) => {
    seen.push(url);
    assert.match(opts.headers["User-Agent"], /Mozilla/);
    if (/\.jpg/.test(url)) {
      return {
        status: 200, ok: true,
        headers: { get: (k) => (k.toLowerCase() === "content-type" ? "image/jpeg" : null) },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    }
    return htmlResponse(PAGE);
  };
  try {
    const { req, res } = mockReqRes({ headers: OK, body: { url: BASE } });
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body.text, /Captain Arthur Phillip/);
    assert.equal(res.body.image, "https://example.org/sites/default/files/1788_FirstFleet.jpg?v=1");
    assert.equal(res.body.imageDataUrl, "data:image/jpeg;base64," + Buffer.from([1, 2, 3]).toString("base64"));
    assert.equal(seen.length, 2);
  } finally { globalThis.fetch = origFetch; }
});

test("says so plainly when the site serves a bot check", async () => {
  __resetRateLimit();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => htmlResponse(
    `<title>Just a moment...</title><body><h2>Performing security verification</h2>
     <p>This website uses a security service to protect against malicious bots.</p></body>`
  );
  try {
    const { req, res } = mockReqRes({ headers: OK, body: { url: BASE } });
    await handler(req, res);
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /robot check/i);
  } finally { globalThis.fetch = origFetch; }
});

test("a link straight to a picture gets its own advice", async () => {
  __resetRateLimit();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => htmlResponse("\u00ff\u00d8", { type: "image/jpeg" });
  try {
    const { req, res } = mockReqRes({ headers: OK, body: { url: "https://example.org/pic.jpg" } });
    await handler(req, res);
    assert.equal(res.statusCode, 415);
    assert.match(res.body.error, /straight at a picture/i);
  } finally { globalThis.fetch = origFetch; }
});

test("revalidates the host on every redirect hop", async () => {
  __resetRateLimit();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 302, ok: false,
    headers: { get: (k) => (k.toLowerCase() === "location" ? "http://169.254.169.254/latest/" : null) },
  });
  try {
    const { req, res } = mockReqRes({ headers: OK, body: { url: BASE } });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /public web page/i);
  } finally { globalThis.fetch = origFetch; }
});

test("OPTIONS preflight answers 200", async () => {
  const { req, res } = mockReqRes({ method: "OPTIONS" });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
});
