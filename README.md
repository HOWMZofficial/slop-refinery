# slop-refinery

`slop-refinery` is the source repository for the npm package [`eslint-plugin-slop-refinery`](https://www.npmjs.com/package/eslint-plugin-slop-refinery). It packages reusable ESLint rules pulled out of `pulse` and ships flat configs for Node.js/TypeScript/JavaScript projects.

## Included rules

- `slop-refinery/function-order`
- `slop-refinery/init-at-bottom`
- `slop-refinery/no-default-export`
- `slop-refinery/types-at-top`

The more project-specific Express, React, and SQL rules from `pulse` are intentionally excluded. The recommended config also uses `eslint-plugin-check-file` to enforce kebab-case file and folder naming.

## Install

```bash
npm install --save-dev eslint eslint-plugin-slop-refinery jiti
```

## ESLint flat config

```ts
import { recommendedConfig } from 'eslint-plugin-slop-refinery';

export default [...recommendedConfig];
```

`recommendedConfig` is the package's single lint recommendation: the custom `slop-refinery/*` rules plus the generic baseline rules that belong in the package.

If you only want the deterministic sorting rules for formatting flows, use the separate format config:

```ts
import { formatConfig } from 'eslint-plugin-slop-refinery';

export default [...formatConfig];
```

The intended script shape is:

```json
{
    "scripts": {
        "format": "prettier --write . && eslint --fix --config eslint.format.config.ts ."
    }
}
```

## Skills

This repo currently ships:

- [`skills/slop-refinery-automated-checks`](./skills/slop-refinery-automated-checks)
- [`skills/slop-refinery-setup`](./skills/slop-refinery-setup)

`slop-refinery-setup` is the onboarding skill. It tells an AI how to add the package, wire the ESLint and Prettier configs, normalize scripts, install dependencies, and run the repo checks. The consumer-facing templates live in `skills/slop-refinery-setup/references/templates/typescript`.

This package is authored in TypeScript under `src/` and emits the publishable package under `dist/src` during `prepack`.
