---
name: slop-refinery-setup
description: Set up a TypeScript repository to use the slop-refinery feature pipeline, skills, PR template, ESLint, Prettier, and validation commands.
license: MIT
---

Use this skill when the task is to adopt the `slop-refinery` skill set and the `slop-refinery/eslint-plugin` plugin surface in a TypeScript repository or fix an existing setup.

## Goal

Make the target repo work with:

- `slop-refinery-pipeline`
- `.github/pull_request_template.md`
- `recommendedConfig`
- `formatConfig`
- Prettier
- `format`, `lint`, and `typecheck`
- the `slop-refinery-quick-checks` skill
- the `slop-refinery-irreducible-simplicity` skill
- the `slop-refinery-eslint-tests` skill

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
    - current `.github/pull_request_template.md`, if any
3. Merge the templates into the repo. Do not blindly replace unrelated conventions.
    - Create `.github` if it does not exist.
    - Keep the Slop Refinery checklist at the start of `.github/pull_request_template.md`, unchanged.
    - Keep any existing repository-specific PR instructions after that checklist.
    - Do not duplicate the checklist when setup runs again.
4. Ensure the repo has the dev dependencies specified in `references/templates/typescript/package.json`.
    - Merge those dev dependencies into the target repo instead of dropping unrelated existing dependencies.
5. Ensure the rest of the Slop Refinery skills are installed. Install any that are missing:

```bash
npx skills add HOWMZofficial/slop-refinery --skill slop-refinery-pipeline slop-refinery-quick-checks slop-refinery-irreducible-simplicity slop-refinery-eslint-tests -y
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
