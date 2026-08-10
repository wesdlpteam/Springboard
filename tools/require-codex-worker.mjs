#!/usr/bin/env node

// Project-local Claude PreToolUse guard.
// Fable/Claude may plan, review, and verify, but Codex is Springboard's sole
// implementation writer. Codex runs in a child process, so its edits do not
// pass through this Claude hook.

import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STRUCTURED_WRITE_TOOLS = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

const ALLOWED_SHELL_COMMANDS = [
  /^(?:rg|where(?:\.exe)?)(?:\s|$)/i,
  /^(?:Get-Content|Get-ChildItem|Get-Item|Test-Path|Select-String|Resolve-Path|Get-Command|Get-Process|Get-CimInstance)(?:\s|$)/i,
  /^git\s+(?:status|diff|log|show|grep|ls-files|rev-parse|branch|remote|check-ignore)(?:\s|$)/i,
  /^node\s+--(?:check|test)(?:\s|$)/i,
  /^npm\s+test(?:\s|$)/i,
  /^npm\s+run\s+(?:check:ui|audit|audit:static|audit:deck|audit:ui|audit:routines)(?:\s|$)/i,
  /^npx\s+vercel\s+dev(?:\s|$)/i,
  /^node\s+tools[\\/](?:stats-stub|compile-check|audit-static|audit-deck|audit-ui|audit-routine-sweep)\.(?:mjs|cjs)(?:\s|$)/i,
  /^git\s+(?:add|commit|push)(?:\s|$)/i,
  /^vercel\s+--prod\s+--yes(?:\s|$)/i,
  /^curl(?:\.exe)?\s+-i\s+-X\s+OPTIONS\s+https:\/\/springboard-dlp-s-projects\.vercel\.app\/api\/[A-Za-z0-9_./-]+\s*$/i,
  /^claude\s+doctor\s*$/i,
  /^(?:node|npm|npx|codex|claude|vercel)\s+--version\s*$/i,
];

const WORKER_SCRIPT_SUFFIX = "/.claude/skills/codex-worker/scripts/codex-worker.mjs";
const VALID_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);
const VALID_SANDBOXES = new Set(["read-only", "workspace-write"]);

function deny(reason) {
  return { decision: "deny", reason };
}

function resolvePath(value, cwd) {
  if (!value) return null;
  return path.resolve(cwd, String(value));
}

function isInside(projectRoot, target) {
  const relative = path.relative(projectRoot, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativeProjectPath(projectRoot, target) {
  return path.relative(projectRoot, target).replaceAll("\\", "/");
}

function isPlanningPath(projectRoot, target) {
  const relative = relativeProjectPath(projectRoot, target);
  return relative === "docs/superpowers" || relative.startsWith("docs/superpowers/");
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function tokenizeCommandLine(command) {
  const tokens = [];
  let current = "";
  let quote = null;

  for (const character of command.trim()) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (quote) return null;
  if (current) tokens.push(current);
  return tokens;
}

function hasUnquotedControlOperator(command) {
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (";|<>&\r\n".includes(character)) return true;
  }
  return quote !== null;
}

function parseWorkerOptions(tokens) {
  const options = new Map();
  for (let index = 3; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value === undefined || options.has(flag)) return null;
    options.set(flag, value);
  }
  return options;
}

function isAllowedWorkerCommand(command, projectRoot) {
  const tokens = tokenizeCommandLine(command);
  if (!tokens || tokens.length < 5) return false;
  if (!/^(?:node|node\.exe)$/i.test(tokens[0])) return false;

  const script = tokens[1].replaceAll("\\", "/").toLowerCase();
  if (!path.isAbsolute(tokens[1]) || !script.endsWith(WORKER_SCRIPT_SUFFIX)) return false;

  const action = tokens[2];
  const options = parseWorkerOptions(tokens);
  if (!options || !options.has("--cwd") || !samePath(options.get("--cwd"), projectRoot)) return false;

  if (action === "status") {
    return options.size === 1;
  }

  if (action !== "run") return false;
  const allowedFlags = new Set(["--cwd", "--prompt-file", "--effort", "--sandbox", "--resume"]);
  if ([...options.keys()].some((flag) => !allowedFlags.has(flag))) return false;
  if (!options.has("--prompt-file") || !options.has("--effort") || !options.has("--sandbox")) return false;

  const promptPath = path.resolve(options.get("--prompt-file"));
  if (!isInside(path.resolve(os.tmpdir()), promptPath)) return false;
  if (!VALID_EFFORTS.has(options.get("--effort"))) return false;
  if (!VALID_SANDBOXES.has(options.get("--sandbox"))) return false;
  if (options.has("--resume") && !/^[A-Za-z0-9._:-]+$/.test(options.get("--resume"))) return false;
  return true;
}

function isAllowedShellCommand(command, projectRoot) {
  const trimmed = command.trim();
  if (!trimmed || hasUnquotedControlOperator(trimmed)) return false;
  if (isAllowedWorkerCommand(trimmed, projectRoot)) return true;
  return ALLOWED_SHELL_COMMANDS.some((pattern) => pattern.test(trimmed));
}

export function evaluate(toolName, input = {}, context = {}) {
  const projectRoot = path.resolve(
    context.projectRoot || process.env.CLAUDE_PROJECT_DIR || context.cwd || process.cwd(),
  );
  const cwd = path.resolve(context.cwd || projectRoot);

  if (STRUCTURED_WRITE_TOOLS.has(toolName)) {
    const requestedPath = input.file_path || input.notebook_path || input.path;
    const target = resolvePath(requestedPath, cwd);

    if (!target) {
      return deny(
        "Blocked by Springboard's one-writer policy: this repository write has no resolvable path. Invoke the `codex-worker` skill and let Codex implement the change.",
      );
    }

    // The delegation brief must be written outside the repository, normally in Temp.
    if (!isInside(projectRoot, target)) return null;

    // Fable owns planning and may maintain Superpowers specs/plans directly.
    if (isPlanningPath(projectRoot, target)) return null;

    return deny(
      `Blocked by Springboard's one-writer policy: Fable/Claude cannot directly change ${relativeProjectPath(projectRoot, target)}. Invoke the \`codex-worker\` skill and use Codex as the sole implementation writer.`,
    );
  }

  if (SHELL_TOOLS.has(toolName)) {
    const command = String(input.command || "");
    if (isAllowedShellCommand(command, projectRoot)) return null;

    return deny(
      "Blocked by Springboard's one-writer policy: this shell command is not on Fable/Claude's project allowlist. Invoke the `codex-worker` skill for implementation. Fable/Claude may use approved read-only discovery, worker control, tests, review, commit, deployment, and reporting commands.",
    );
  }

  return null;
}

function emitDecision(result) {
  if (!result) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: result.decision,
        permissionDecisionReason: result.reason,
      },
    }),
  );
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const event = JSON.parse(raw || "{}");
      emitDecision(
        evaluate(event.tool_name, event.tool_input, {
          projectRoot: process.env.CLAUDE_PROJECT_DIR || event.cwd,
          cwd: event.cwd,
        }),
      );
    } catch (error) {
      emitDecision(
        deny(
          `Springboard's Codex writer guard failed closed (${error.message}). Stop and report the hook error instead of implementing directly.`,
        ),
      );
    }
    process.exit(0);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
