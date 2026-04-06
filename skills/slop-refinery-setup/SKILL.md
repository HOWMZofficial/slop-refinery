---
name: slop-refinery-setup
description: Set up a TypeScript repository to use slop-refinery by wiring ESLint, Prettier, package scripts, and validation commands, then verify the integration end to end.
---

Use this skill when the task is to adopt the `slop-refinery` skill set and `eslint-plugin-slop-refinery` in a TypeScript repository or fix an existing setup.

## Goal

Make the target repo work with:

- `recommendedConfig`
- `formatConfig`
- Prettier
- `format`, `lint`, and `typecheck`
- the `slop-refinery-quick-checks` skill

The TypeScript templates in `references/templates/typescript/` are merge targets, not blind replacements.

Workaround for the current `skills` dotfile-copy bug:

- `references/templates/typescript/prettierrc` must be written into the target repo as `.prettierrc`.
- This is a temporary workaround for [vercel-labs/skills#869](https://github.com/vercel-labs/skills/pull/869).

## Workflow

1. Read `references/templates/typescript/`.
2. Inspect the target repo:
    - `package.json`
    - lockfile and package manager
    - current ESLint config
    - current Prettier config
    - current scripts
    - whether the repo uses `AGENTS.md` or `CLAUDE.md` for agent instructions
3. Merge the templates into the repo. Do not blindly replace unrelated conventions.
    - Write `references/templates/typescript/prettierrc` to the target repo as `.prettierrc`.
4. Ensure the repo has the needed dev dependencies:
    - `eslint`
    - `eslint-plugin-slop-refinery`
    - `jiti` when using `eslint.config.ts` or `eslint.format.config.ts`
    - `prettier` if it is missing
5. Ensure `slop-refinery-quick-checks` is installed. If it is missing, install it with:

```bash
npx skills add HOWMZofficial/slop-refinery --skill slop-refinery-quick-checks -y
```

6. Ensure the ESLint config imports `recommendedConfig`.
    - Do not turn off, ignore, override, or weaken any rules from `recommendedConfig`.
    - Apply `recommendedConfig` as broadly as possible.
    - If the repo has no existing ESLint file-pattern scoping, use the broadest applicable JS/TS file set.
    - If the repo already applies ESLint to JS/TS source files, apply `recommendedConfig` to those same file families as well.
7. Ensure the format config imports `formatConfig`.
8. Ensure the repo has:
    - `typecheck`
    - `format`
    - `lint`
    - agent instructions in the repo's existing instruction file:
      use `AGENTS.md` when present
      otherwise, if `CLAUDE.md` exists, merge the guidance there instead of creating `AGENTS.md`
9. Install dependencies.
10. Run `slop-refinery-quick-checks` and fix any issues it surfaces.
    - Expect validation to fail during setup. That is normal.
    - It is common for setup to surface many linting errors at first.
    - Fix the code or setup until validation passes.
    - Do not disable rules, narrow rule scope, or weaken `recommendedConfig` to get to green.

If setup changes are required while fixing a problem, run `slop-refinery-quick-checks` again until everything is clean.

## Guardrails

- Prefer merging over replacing.
- Prefer the repo's existing agent-instructions file. If the repo is using `CLAUDE.md`, update that file instead of adding a second `AGENTS.md`.
- Do not turn off, ignore, or modify any rules from `recommendedConfig` during setup.
- Do not narrow the scope of `recommendedConfig` unless the repo already has a broader established ESLint scope you are merging into.
- Apply `recommendedConfig` to the broadest reasonable JS/TS file set the repo supports.
- Expect setup to surface validation failures, often many of them.
- Treat those failures as work to fix, not as a reason to disable or weaken rules.
- Do not invent a placeholder `test` script.
- Do not leave the repo partially configured.
