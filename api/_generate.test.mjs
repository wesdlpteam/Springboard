import assert from "node:assert";
import { injectStudyGuide } from "./generate.js";
const base = [{ role: "system", content: "SYS" }, { role: "user", content: "U" }];
assert.deepStrictEqual(injectStudyGuide(base, { key: "nope", units: "1-2" }), base);      // unknown -> unchanged
assert.deepStrictEqual(injectStudyGuide(base, { key: "../_lib", units: "1-2" }), base);   // traversal -> unchanged
const out = injectStudyGuide(base, { key: "biology", units: "1-2" });
assert.ok(out[0].content.includes("SYS"));
assert.ok(/Units 1[–-]2/.test(out[0].content));
console.log("injectStudyGuide OK");
