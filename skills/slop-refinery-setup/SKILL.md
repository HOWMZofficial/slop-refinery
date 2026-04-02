---
name: slop-refinery-setup
description: Set up a Node.js, TypeScript, or JavaScript repository to use slop-refinery by wiring ESLint, Prettier, package scripts, and validation commands, then verify the integration end to end.
---

Use this skill when the task is to adopt `eslint-plugin-slop-refinery` in an existing repository, scaffold a new repository around it, or repair a broken setup.

## Goal

Make the target repository actually usable with `slop-refinery`, not just partially configured. That usually means:

- adding or updating package dependencies
- creating or updating the ESLint flat config
- creating or updating the Prettier config
- adding or normalizing the package scripts
- installing dependencies
- running the repo checks and fixing setup issues

## Required Behavior

1. Inspect the repository before changing anything:
    - package manager and lockfile
    - current `package.json`
    - current ESLint and Prettier setup
    - whether the repo is JavaScript-only or TypeScript-based
2. Choose the lint preset:
    - use `recommendedConfig`
3. Make the minimum set of changes needed to get the repo working.
4. Do not replace unrelated repo conventions unless they directly block the setup.
5. After wiring the setup, install dependencies and run the checks.

## Validation Workflow

After making setup changes, run these commands when they exist in the target repo:

1. `npm run typecheck`
2. `npm run format`
3. `npm run lint`
4. `npm test`

If a change is required while fixing an issue, restart from command `1`.

## Integration Steps

1. Read `references/consumer-setup.md`.
2. Read the template directory in `references/templates/typescript/`.
3. Inspect the target repo and determine:
    - whether it already uses ESLint flat config
    - whether Prettier already exists
    - whether scripts already exist and should be merged instead of overwritten
4. Add the package dependency:
    - `eslint-plugin-slop-refinery`
    - `eslint`
    - `jiti` when the repo uses `eslint.config.ts` or `eslint.format.config.ts`
    - add `prettier` if the repo does not already have it
5. Use the template files as merge targets, not blind replacements:
    - `AGENTS.md`
    - `.prettierrc`
    - `eslint.config.*`
    - `package.json`
    - `tsconfig.json`
6. Create or update the ESLint config to import `recommendedConfig`.
7. Create or update the format-only ESLint config to import `formatConfig`.
8. Create or update `.prettierrc` to match the baseline style when that is acceptable for the repo.
9. Create or normalize the repo scripts:
    - `typecheck`
    - `format`
    - `lint`
    - `test` if the repo already has tests or the task explicitly wants one
10. Install dependencies with the repo's package manager.
11. Run the validation workflow and fix any setup issues surfaced by those commands.

## Guardrails

- Prefer merging into the existing setup over replacing it.
- If the repo already has working lint or format scripts, adapt them instead of renaming everything blindly.
- Do not add TypeScript-only commands to a plain JavaScript repo unless the repo is being converted to TypeScript as part of the task.
- If the repo has no tests, do not invent a placeholder `test` script unless the task explicitly asks for one.

## Output

At the end, summarize:

- what setup files changed
- which preset was chosen and why
- which commands passed
- any remaining blockers or follow-ups
