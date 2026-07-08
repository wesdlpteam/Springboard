// Compile gate: extracts the inline <script type="text/babel"> block from
// index.html and runs it through Babel. Fails loudly on any JSX/JS syntax error.
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: no text/babel script block found"); process.exit(1); }
try {
  transformSync(m[1], { presets: [["@babel/preset-react", { runtime: "classic" }]], filename: "index.jsx" });
  console.log("OK: index.html JSX compiles");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
}
