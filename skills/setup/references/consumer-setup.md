# Consumer Setup Reference

Use this file for selection guidance. The canonical consumer templates live under `references/templates/`.

## Template Directories

- `references/templates/typescript/`: baseline TypeScript consumer repo shape

These files are merge templates, not blind replacements.

## Install

```bash
npm install --save-dev eslint eslint-plugin-slop-refinery jiti
```

Add `prettier` too if the repo does not already use it:

```bash
npm install --save-dev prettier
```

## Preset Selection

- Default to `recommendedConfig`.
- Use `strictConfig` when the repo is TypeScript-heavy and explicitly wants the broader Pulse-style rule set.
- Use `formatConfig` only for formatting-only adoption flows.

## Sorting

- Prefer `format` to run Prettier first and then ESLint auto-fixes against `formatConfig`.

## Merge Rules

- Merge template files into the target repo instead of overwriting unrelated conventions.
- Treat `package.json` and `tsconfig*.json` as starting points, not mandatory exact shapes.
