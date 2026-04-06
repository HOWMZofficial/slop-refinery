---
name: slop-refinery-eslint-tests
description: Write tests for custom ESLint rules. Use this when adding or updating rules and you need matching coverage in the repo's ESLint test layout, defaulting to eslint/custom-rules and eslint/tests when no layout exists yet.
---

# ESLint Tests

Write rule tests with `RuleTester` and run them under `vitest`.

At a high level:

- If the repo already has an ESLint rule and test layout, follow that structure.
- If the repo does not have an ESLint rule and test layout yet, default to `eslint/custom-rules` for rules and `eslint/tests` for rule tests.
- Mirror each custom rule with a matching test file in the location the repo uses for ESLint rule tests.
- Keep the tests focused on the rule contract, not unrelated parser or config behavior.
- Prefer small inline code samples that make the valid or invalid case obvious.

Use this structure for each custom rule:

- `10` valid examples that should produce no errors.
- `10` invalid examples that should report the expected rule message(s).

Guidelines:

- Reuse a small shared test harness if the repo already has one.
- Prefer the repo's existing ESLint test structure when it is already present.
- If no ESLint-specific structure exists yet, use `eslint/custom-rules` and `eslint/tests`.
- Use realistic filenames when the rule depends on file paths.
- Cover the main happy paths first, then important edge cases.
- For invalid cases, assert the specific message id when practical.

Definition of done:

- Every custom rule has a matching test file.
- Each test file contains `10` valid and `10` invalid examples.
- The tests run through the repo's normal `vitest` configuration.
