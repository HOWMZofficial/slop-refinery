---
name: code-simplicity
description: Make a Node.js, TypeScript, or JavaScript codebase simpler without changing the intended behavior.
---

Use this skill when the task is to reduce complexity, delete dead code, or tighten an implementation that has become bloated.

## Inputs

- `SOURCE_CODE`: the directory or file path under review
- Optional `CODE_HIERARCHY_RIGOR`: `directory`, `file`, `function`, or `statement`

## Working Files

- `RUN_ID`: current UTC timestamp in `YYYYMMDDTHHMMSSZ`
- `RUN_DIR`: `.ai_scratchpad/code_simplicity/<RUN_ID>/`
- `CODE_STRUCTURE_FILE_PATH`: `.ai_scratchpad/code_simplicity/<RUN_ID>/code_structure.md`
- `NOTES_FILE_PATH`: `.ai_scratchpad/code_simplicity/<RUN_ID>/notes.md`

## Hierarchy Command

Generate the hierarchy with the skill-local script, not a repo-global script:

```bash
npx tsx ./skills/code-simplicity/scripts/generate-code-hierarchy.ts --source "<SOURCE_CODE>" --rigor "<CODE_HIERARCHY_RIGOR>" --output "<CODE_STRUCTURE_FILE_PATH>"
```

If `CODE_HIERARCHY_RIGOR` is not provided, default to `file`.

## Workflow

1. Create `RUN_DIR`.
2. Generate `CODE_STRUCTURE_FILE_PATH`.
3. Read the code and restate the real requirement in `NOTES_FILE_PATH` before changing anything.
4. Delete code, wrappers, branches, and abstractions that do not clearly earn their existence.
5. Simplify what remains so the control flow, data flow, and module boundaries are easier to understand.
6. Keep notes on what was deleted, what was simplified, and what was intentionally kept.
7. Re-run the repository checks documented by the repo. At minimum, if they exist, run:
    - `npm run typecheck`
    - `npm run format`
    - `npm run lint`

## Guardrails

- Prefer deletion before refactoring.
- Do not introduce abstractions that only make the current code look tidy.
- Keep public behavior and contracts stable unless the task explicitly changes them.
- Remove dead code, dead tests, and stale docs together when safe.
- If the requirement is vague, rewrite it into something observable before editing code.

## Completion Criteria

- The resulting code has fewer moving parts.
- The remaining logic is easier to follow.
- Any retained complexity has a concrete reason.
- The repo checks pass after the simplification work.
