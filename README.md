# slop-refinery

`slop-refinery` is the source repository for the npm package [`eslint-plugin-slop-refinery`](https://www.npmjs.com/package/eslint-plugin-slop-refinery). It packages reusable ESLint rules pulled out of `pulse` and ships flat configs for Node.js/TypeScript/JavaScript projects.

## Included rules

- `slop-refinery/function-order`
- `slop-refinery/init-at-bottom`
- `slop-refinery/no-default-export`
- `slop-refinery/react-component-name`
- `slop-refinery/types-at-top`

The more project-specific Express, React, and path-shape rules from `pulse` are still intentionally excluded.

## Install

```bash
npm install --save-dev eslint eslint-plugin-slop-refinery jiti
```

## ESLint flat config

```ts
import { recommendedConfig } from 'eslint-plugin-slop-refinery';

export default [...recommendedConfig];
```

`recommendedConfig` is the lighter entry point: the custom `slop-refinery/*` rules plus a small generic baseline.

If you want the broader Pulse-style rule set, including the packaged third-party rules that `pulse` enforces, use the strict preset:

```ts
import { strictConfig } from 'eslint-plugin-slop-refinery';

export default [...strictConfig];
```

`strictConfig` bundles the generic non-custom rules from `pulse`, including selected `@typescript-eslint`, `eslint-plugin-functional`, `eslint-plugin-perfectionist`, and `eslint-plugin-sonarjs` rules.

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

General-purpose skills live in [`skills/slop-refinery-code-simplicity`](./skills/slop-refinery-code-simplicity), [`skills/slop-refinery-code-security`](./skills/slop-refinery-code-security), [`skills/slop-refinery-automated-checks`](./skills/slop-refinery-automated-checks), and [`skills/slop-refinery-setup`](./skills/slop-refinery-setup).

`slop-refinery-setup` is the consumer-onboarding skill: it tells an AI how to retrofit a TypeScript repository to `slop-refinery`, including the package dependency, ESLint flat config, Prettier config, package scripts, dependency installation, and verification commands. The consumer-facing templates now live in `skills/slop-refinery-setup/references/templates/typescript`.

The hierarchy generator exists only inside the hierarchy-based skills so those skills remain self-contained when copied into another repo.

This package is authored in TypeScript under `src/` and emits the publishable package under `dist/src` during `prepack`.
