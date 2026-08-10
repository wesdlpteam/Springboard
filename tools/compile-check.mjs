// Compile gate: extracts the inline app source, compiles it as one classic script and writes the
// hash-paired production artifact. Fails loudly on any JSX/JS syntax error.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { transformSync } from "@babel/core";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/<script type="text\/sb-src" id="sb-app-source">([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: no sb-app-source script block found"); process.exit(1); }
try {
  const source = m[1];
  const result = transformSync(source, {
    presets: [["@babel/preset-react", { runtime: "classic" }]],
    filename: "index.jsx",
    sourceType: "script",
    babelrc: false,
    configFile: false,
  });
  // Browsers normalise script text to LF, so the artifact hash must ignore checkout line endings.
  const hashSource = source.replace(/\r\n?/g, "\n");
  const hash = createHash("sha256").update(hashSource, "utf8").digest("hex");
  writeFileSync(new URL("../assets/app.js", import.meta.url), `// sb-source-sha256: ${hash}\n${result.code}\n`, "utf8");
  console.log("OK: index.html JSX compiles; assets/app.js regenerated");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
}
