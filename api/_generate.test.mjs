import assert from "node:assert";
import { injectStudyGuide, injectStickiness } from "./generate.js";
const base = [{ role: "system", content: "SYS" }, { role: "user", content: "U" }];
assert.deepStrictEqual(injectStudyGuide(base, { key: "nope", units: "1-2" }), base);      // unknown -> unchanged
assert.deepStrictEqual(injectStudyGuide(base, { key: "../_lib", units: "1-2" }), base);   // traversal -> unchanged
const out = injectStudyGuide(base, { key: "biology", units: "1-2" });
assert.ok(out[0].content.includes("SYS"));
assert.ok(/Units 1[–-]2/.test(out[0].content));
console.log("injectStudyGuide OK");

// Australian Curriculum guides: year-level slice, banded levels, out-of-range -> unchanged.
const ac = injectStudyGuide(base, { key: "ac-mathematics", level: "4" });
assert.ok(ac[0].content.includes("## Year 4") && ac[0].content.includes("AC9M4N01"));
assert.ok(!ac[0].content.includes("## Year 5"));
assert.ok(injectStudyGuide(base, { key: "ac-dance", level: "3" })[0].content.includes("## Years 3 and 4"));
assert.ok(injectStudyGuide(base, { key: "ac-english", level: "Prep" })[0].content.includes("## Foundation Year"));
assert.deepStrictEqual(injectStudyGuide(base, { key: "ac-history", level: "4" }), base);
console.log("injectStudyGuide (Australian Curriculum) OK");

// Stickiness: off/absent -> unchanged; on -> SUCCESs frame appended to the system message.
assert.deepStrictEqual(injectStickiness(base, false), base);
assert.deepStrictEqual(injectStickiness(base, undefined), base);
const st = injectStickiness(base, true);
assert.ok(st[0].content.includes("SYS"));
assert.ok(/SUCCESs/.test(st[0].content) && /SIMPLE/.test(st[0].content));
assert.strictEqual(st[1].content, "U"); // user message untouched
console.log("injectStickiness OK");
