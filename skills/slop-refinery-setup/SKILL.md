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
- the `slop-refinery-automated-checks` skill

The TypeScript templates in `references/templates/typescript/` are merge targets, not blind replacements.

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
4. Ensure the repo has the needed dev dependencies:
    - `eslint`
    - `eslint-plugin-slop-refinery`
    - `jiti` when using `eslint.config.ts` or `eslint.format.config.ts`
    - `prettier` if it is missing
5. Ensure `slop-refinery-automated-checks` is installed. If it is missing, install it with:

```bash
npx skills add HOWMZofficial/slop-refinery --skill slop-refinery-automated-checks -y
```

6. Ensure the ESLint config imports `recommendedConfig`.
7. Ensure the format config imports `formatConfig`.
8. Ensure the repo has:
    - `typecheck`
    - `format`
    - `lint`
    - agent instructions in the repo's existing instruction file:
      use `AGENTS.md` when present
      otherwise, if `CLAUDE.md` exists, merge the guidance there instead of creating `AGENTS.md`
9. Install dependencies.
10. Run `slop-refinery-automated-checks` and fix any issues it surfaces.

If setup changes are required while fixing a problem, run `slop-refinery-automated-checks` again until everything is clean.

## Guardrails

- Prefer merging over replacing.
- Prefer the repo's existing agent-instructions file. If the repo is using `CLAUDE.md`, update that file instead of adding a second `AGENTS.md`.
- Do not invent a placeholder `test` script.
- Do not leave the repo partially configured.
