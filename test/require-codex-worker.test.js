import test from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluate } from "../tools/require-codex-worker.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, "fixtures", "springboard-project");
const HOOK_PATH = path.resolve(TEST_DIR, "..", "tools", "require-codex-worker.mjs");
const CONTEXT = { projectRoot: PROJECT_ROOT, cwd: PROJECT_ROOT };

// The break-glass switch is a real file in Nathan's home directory, so these tests must
// not depend on whether it happens to be active right now. Point every test at a path
// that does not exist; the break-glass tests below supply their own temp file.
const NO_FLAG = path.join(os.tmpdir(), "springboard-no-such-fable-flag.json");
process.env.SPRINGBOARD_FABLE_WRITE_FLAG = NO_FLAG;

const writeFlag = (contents) => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "sb-flag-")),
    "springboard-fable-writes.json",
  );
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
  return file;
};

const withFlag = (file, run) => {
  const previous = process.env.SPRINGBOARD_FABLE_WRITE_FLAG;
  process.env.SPRINGBOARD_FABLE_WRITE_FLAG = file;
  try { return run(); } finally { process.env.SPRINGBOARD_FABLE_WRITE_FLAG = previous; }
};

test("blocks Claude structured edits inside the project", () => {
  for (const [toolName, toolInput] of [
    ["Edit", { file_path: path.join(PROJECT_ROOT, "index.html") }],
    ["Write", { file_path: path.join(PROJECT_ROOT, "api", "generate.js") }],
    ["MultiEdit", { file_path: path.join(PROJECT_ROOT, "test", "generate.test.js") }],
    ["NotebookEdit", { notebook_path: path.join(PROJECT_ROOT, "analysis.ipynb") }],
  ]) {
    const result = evaluate(toolName, toolInput, CONTEXT);
    assert.equal(result?.decision, "deny", `${toolName} should be denied`);
    assert.match(result.reason, /codex-worker/);
  }
});

test("allows Fable planning files and the external Codex prompt", () => {
  const plan = evaluate(
    "Write",
    { file_path: path.join(PROJECT_ROOT, "docs", "superpowers", "plans", "feature.md") },
    CONTEXT,
  );
  const tempPrompt = evaluate(
    "Write",
    { file_path: path.resolve(PROJECT_ROOT, "..", "codex-prompt.md") },
    CONTEXT,
  );

  assert.equal(plan, null);
  assert.equal(tempPrompt, null);
});

test("blocks obvious shell-writing workarounds", () => {
  for (const [toolName, command] of [
    ["PowerShell", "Set-Content -Path index.html -Value $html"],
    ["Bash", "cat build.txt > index.html"],
    ["Bash", "apply_patch < change.patch"],
    ["PowerShell", "npm install new-production-package"],
    ["PowerShell", "node -e \"require('fs').writeFileSync('index.html', 'x')\""],
    ["PowerShell", "codex exec --sandbox workspace-write 'change index.html'"],
  ]) {
    const result = evaluate(toolName, { command }, CONTEXT);
    assert.equal(result?.decision, "deny", command);
  }
});

test("allows exact worker control and Fable verification commands", () => {
  const worker = path.join(
    path.parse(PROJECT_ROOT).root,
    "Users",
    "BennN",
    ".claude",
    "skills",
    "codex-worker",
    "scripts",
    "codex-worker.mjs",
  );
  const prompt = path.join(os.tmpdir(), "springboard-codex-prompt.md");
  const commands = [
    `node "${worker}" status --cwd "${PROJECT_ROOT}"`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox workspace-write`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort ultra --sandbox workspace-write`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox workspace-write --visual-required true`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox workspace-write --network-approved true`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --resume thread_123 --effort ultra --sandbox workspace-write`,
    "rg --files .",
    "Get-Content -Raw CLAUDE.md",
    "git status --short",
    "git diff --check",
    "npm test",
    "npm run check:ui",
    "vercel --prod --yes",
    "git commit -m 'test'",
    "git push",
  ];

  for (const command of commands) {
    assert.equal(evaluate("PowerShell", { command }, CONTEXT), null, command);
  }
});

test("allows only the deliberate live-audit command forms", () => {
  const allowed = [
    "npm run audit:live",
    "npm run audit:live:rerun",
    "node tools/audit-live.mjs",
    "node tools/audit-live-report.mjs",
    "node tools/audit-live-viewer.mjs",
  ];
  const denied = [
    "FORCE=1 npm run audit:live",
    "$env:FORCE='1'; npm run audit:live",
    "npm run audit:live -- --force",
    "node tools/audit-live.mjs --force",
    "npm run audit:live && Set-Content index.html x",
  ];

  for (const command of allowed) {
    assert.equal(evaluate("PowerShell", { command }, CONTEXT), null, command);
  }
  for (const command of denied) {
    assert.equal(evaluate("PowerShell", { command }, CONTEXT)?.decision, "deny", command);
  }
});

test("rejects worker bypasses and incorrectly scoped worker commands", () => {
  const worker = path.join(
    path.parse(PROJECT_ROOT).root,
    "Users",
    "BennN",
    ".claude",
    "skills",
    "codex-worker",
    "scripts",
    "codex-worker.mjs",
  );
  const prompt = path.join(os.tmpdir(), "springboard-codex-prompt.md");
  const wrongRoot = path.resolve(PROJECT_ROOT, "..", "another-project");
  const localPrompt = path.join(PROJECT_ROOT, "prompt.md");
  const commands = [
    `node "${worker}" run --cwd "${wrongRoot}" --prompt-file "${prompt}" --effort xhigh --sandbox workspace-write`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${localPrompt}" --effort xhigh --sandbox workspace-write`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox workspace-write ; Set-Content index.html x`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox unrestricted`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox read-only --visual-required true`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox workspace-write --visual-required maybe`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox read-only --network-approved true`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort xhigh --sandbox workspace-write --network-approved maybe`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort low --sandbox workspace-write`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort medium --sandbox workspace-write`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort high --sandbox workspace-write`,
    `node "${worker}" run --cwd "${PROJECT_ROOT}" --prompt-file "${prompt}" --effort max --sandbox workspace-write`,
  ];

  for (const command of commands) {
    assert.equal(evaluate("PowerShell", { command }, CONTEXT)?.decision, "deny", command);
  }
});

test("hook entrypoint emits a Claude PreToolUse deny response", () => {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_ROOT, SPRINGBOARD_FABLE_WRITE_FLAG: NO_FLAG },
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: path.join(PROJECT_ROOT, "index.html") },
      cwd: PROJECT_ROOT,
    }),
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /codex-worker/);
});

test("hook entrypoint fails closed on malformed input", () => {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_ROOT },
    input: "not-json",
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /failed closed/i);
});

test("break glass: a valid unexpired switch lets Fable write, and only then", () => {
  const target = { file_path: path.join(PROJECT_ROOT, "index.html") };
  const denied = () => assert.equal(evaluate("Edit", target, CONTEXT)?.decision, "deny");

  // No switch at all: the one-writer default holds.
  denied();

  // A fresh, valid grant opens structured writes.
  const live = writeFlag({ granted_at: new Date().toISOString(), hours: 24 });
  withFlag(live, () => assert.equal(evaluate("Edit", target, CONTEXT), null));

  // Expired, malformed, missing fields and non-positive windows all fail closed.
  const expired = writeFlag({
    granted_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    hours: 24,
  });
  const zeroHours = writeFlag({ granted_at: new Date().toISOString(), hours: 0 });
  const noDate = writeFlag({ hours: 24 });
  const junk = writeFlag("not json at all");
  for (const file of [expired, zeroHours, noDate, junk]) {
    withFlag(file, denied);
  }

  // The switch never opens the shell allowlist.
  withFlag(live, () => {
    assert.equal(evaluate("Bash", { command: "rm -rf ." }, CONTEXT)?.decision, "deny");
  });
});

test("project hook configuration is valid and uses the project-relative script", () => {
  const settingsPath = path.resolve(TEST_DIR, "..", ".claude", "settings.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  const entry = settings.hooks.PreToolUse.find((item) => item.matcher.includes("Edit"));

  assert.ok(entry);
  assert.match(entry.matcher, /PowerShell/);
  assert.match(entry.hooks[0].command, /\$\{CLAUDE_PROJECT_DIR\}/);
  assert.match(entry.hooks[0].command, /require-codex-worker\.mjs/);
});

test("project instructions require visible background Codex progress", () => {
  const claudePath = path.resolve(TEST_DIR, "..", "CLAUDE.md");
  const instructions = readFileSync(claudePath, "utf8");

  assert.match(instructions, /visible background runner/i);
  assert.match(instructions, /run_in_background: true/);
  assert.match(instructions, /--visual-required true/);
  assert.match(instructions, /visual evidence: <path>/i);
  assert.match(instructions, /desktop and mobile checks/i);
  assert.match(instructions, /Use `xhigh` for ordinary implementation/i);
  assert.match(instructions, /`ultra` for demanding coding tasks/i);
  assert.match(instructions, /Do not launch implementation below `xhigh`/i);
  assert.match(instructions, /30–60 seconds/);
  assert.match(instructions, /Never expose or claim hidden chain-of-thought/i);
  assert.match(instructions, /If `codex-worker` is unavailable or fails, stop/i);
});
