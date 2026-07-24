import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const GUIDES_DIR = join(dirname(fileURLToPath(import.meta.url)), "guides");

// Read a guide by key with the same guard injectStudyGuide uses: allowlist regex,
// path-prefix pin, existence. Returns file text or null (never throws on bad input).
export function readGuide(key) {
  if (typeof key !== "string" || !/^[a-z0-9-]+$/.test(key)) return null;
  const file = join(GUIDES_DIR, key + ".md");
  if (!file.startsWith(GUIDES_DIR) || !existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

// Pick the "## <heading>" section of an ac-*.md guide matching a year level ("Prep","4","Year 10").
// Returns (file head + one section), or null if no section matches / year out of range.
export function sliceAcLevel(text, yearLevel) {
  const s = String(yearLevel || "");
  const n = /prep|foundation|^\s*[fk]\s*$/i.test(s) ? 0 : parseInt(s.replace(/\D/g, ""), 10);
  if (Number.isNaN(n) || n > 10) return null;
  const sections = [...text.matchAll(/^## +(.+)$/gm)];
  const hit = sections.find(({ 1: h }) => {
    if (/foundation/i.test(h)) return n === 0;
    const years = (h.match(/\d+/g) || []).map(Number);
    return years.includes(n) || (years.length === 2 && n >= years[0] && n <= years[1]);
  });
  if (!hit) return null;
  const start = hit.index;
  const next = sections.find(sec => sec.index > start);
  const head = text.slice(0, text.indexOf("\n## "));
  return head + "\n" + text.slice(start, next ? next.index : undefined);
}

// Pick the "## Units 1-2" or "## Units 3-4" block of a VCE study guide (no head prepended).
// Returns the raw section slice, or null if the wanted block is absent.
export function sliceVceUnits(text, units) {
  const u = units === "3-4" ? "3-4" : "1-2";
  const wanted = u === "1-2" ? /## Units 1[–-]2/ : /## Units 3[–-]4/;
  const other  = u === "1-2" ? /## Units 3[–-]4/ : /## Units 1[–-]2/;
  const start = text.search(wanted);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const end = rest.search(other);
  return end >= 0 ? text.slice(start, start + 1 + end) : text.slice(start);
}
