# Springboard Codex instructions

## Required repository context

Read `CLAUDE.md` completely before doing any work. It is the canonical repository guide and its commands, architecture, privacy rules, deployment model, and product constraints apply across the whole repository.

## Role in the Fable → Codex workflow

When Fable delegates an implementation through `codex-worker`, Codex is the sole implementation writer for that task.

- Follow the delegation brief's scope, constraints, acceptance criteria, and required tests.
- Preserve pre-existing user changes and do not broaden the task into nearby cleanup or refactoring.
- Make all implementation edits yourself; do not ask Fable to edit project files for you.
- Keep one writer. Corrections and related follow-ups must resume the same Codex thread.
- Run the narrow checks needed for the change. Before handoff, also run `npm test` and `npm run check:ui` unless the brief explicitly explains why one cannot run.
- Report the files changed, verification commands and results, and any remaining risk or decision.
- Do not commit, push, deploy, install new production dependencies, or perform destructive actions unless the delegation brief explicitly authorizes them.

Fable remains responsible for requirements, safety and correctness judgement, reviewing the complete diff, independent verification, and the final explanation to Nathan.
