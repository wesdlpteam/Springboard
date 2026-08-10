import { readFile } from "node:fs/promises";

const DEPLOYED_URL = "https://springboard-dlp-s-projects.vercel.app/";
const WAIT_MS = 30_000;
const TIMEOUT_MS = 10 * 60_000;
const waitMode = process.argv.includes("--wait");

function appVersion(html, where) {
  const match = String(html).match(/const APP_VERSION = "(v\d+\.\d+\.\d+)/);
  if (!match) throw new Error(`APP_VERSION was not found in ${where}`);
  return match[1];
}

const localHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const localVersion = appVersion(localHtml, "local index.html");
const deadline = Date.now() + (waitMode ? TIMEOUT_MS : 0);
let deployedVersion = "unknown";
let lastError = "";

for (;;) {
  try {
    const response = await fetch(DEPLOYED_URL, { redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`deployed site returned HTTP ${response.status}`);
    deployedVersion = appVersion(await response.text(), "the deployed index.html");
    lastError = "";
    if (deployedVersion === localVersion) {
      console.log(`backend matches ${localVersion}`);
      process.exit(0);
    }
  } catch (error) {
    lastError = error && error.message ? error.message : String(error);
  }

  if (!waitMode || Date.now() >= deadline) break;
  console.log(`waiting for backend ${localVersion} (deployed ${deployedVersion})…`);
  await new Promise(resolve => setTimeout(resolve, Math.min(WAIT_MS, Math.max(0, deadline - Date.now()))));
}

if (lastError) {
  console.error(`backend freshness could not be checked (${lastError}) — run: vercel --prod --yes`);
} else {
  console.error(`backend is stale (deployed ${deployedVersion} vs repo ${localVersion}) — run: vercel --prod --yes`);
}
process.exit(1);
