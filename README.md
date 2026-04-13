# Slop Refinery

Even the best frontier coding models generate AI slop by default. They can produce code that works well enough to ship a feature, but not code that is consistently clean. `slop-refinery` exists to help AI agents refine that output into clean code.

Clean code, in this repo, means code that is correct, simple, and maintainable.

```mermaid
flowchart LR
    A["Unrefined Code<br/>(AI slop)"] --> B{{"Refinery"}}
    B --> C(["Clean Code"])
    C -.- D["Correct"]
    C -.- E["Simple"]
    C -.- F["Maintainable"]
```

## Index

- [Installation](#installation)
- [Usage](#usage)
- [TypeScript API](#typescript-api)
- [CLI](#cli)
- [Skills](#skills)
- [ESLint Plugin](#eslint-plugin)
- [Clean Code](#clean-code)
- [Correct](#correct)
- [Simple](#simple)
- [Maintainable](#maintainable)

## Installation

Use `npx skills`. For most repositories, start with the setup skill.

```bash
npx skills add HOWMZofficial/slop-refinery --skill slop-refinery-setup
```

Then use `slop-refinery-setup` in the target repository. It will guide the AI to wire up the package, configs, scripts, and agent instructions.

## Usage

`slop-refinery` is a single npm package with three surfaces:

- `slop-refinery` for the ruleset CLI
- `slop-refinery` for the TypeScript ruleset API
- `slop-refinery/eslint-plugin` for the ESLint plugin and configs

In practice, the easiest adoption path is still `slop-refinery-setup`. That setup skill tells your AI to install the package, create the repository scripts, and update the agent instructions file so those checks run after code changes.

`slop-refinery-quick-checks` is meant to be the fast validation loop. It should run the automated checks that are quick enough to execute after each set of changes an AI makes, not only at the end of a longer task.

This repo also includes `slop-refinery-eslint-tests`, a focused skill for writing tests for custom ESLint rules without assuming a fixed directory layout.

The scripts it sets up are:

- `format`
- `lint`
- `typecheck`

## TypeScript API

```ts
import { pullRuleset, pushRuleset } from 'slop-refinery';
```

The root package exports the ruleset library API plus file helpers like `readRulesetFile`, `writeRulesetFile`, `getDefaultRulesetPath`, and `normalizeRuleset`.

## CLI

```bash
slop-refinery ruleset pull
slop-refinery ruleset push
```

The CLI targets the repository identified by the current checkout's `origin` Git remote. It requires `gh` to be installed and authenticated for ruleset access.

## Skills

Current skills:

- `slop-refinery-eslint-tests`: writes tests for custom ESLint rules while following the repo's existing test layout.
- `slop-refinery-setup`: adopts the `slop-refinery` skills and package in a repository.
- `slop-refinery-quick-checks`: runs the repository's fast automated checks after each set of changes.

## ESLint Plugin

This repo publishes [`slop-refinery`](https://www.npmjs.com/package/slop-refinery). The ESLint plugin lives at the `slop-refinery/eslint-plugin` subpath.

```ts
import { formatConfig, recommendedConfig } from 'slop-refinery/eslint-plugin';
```

The ESLint plugin attempts to codify and automate best practices that are quick and easy for an AI agent to verify against.

Many of the rules are off-the-shelf. Some are custom.

AI now makes it practical to create more elaborate ESLint rules that would have been too expensive or tedious to build before. `slop-refinery` is meant to be a solid general-purpose base, not the final word.

You should create your own ESLint rules with AI for the conventions and architectural constraints that matter in your codebase.

## Clean Code

`slop-refinery` defines clean code as code that is:

- correct
- simple
- maintainable

### Correct

Correct code behaves as intended under normal, edge, adversarial, and high-scale conditions.

### Simple

Simple code is easy to read and easy to reason about. It uses just enough code to get the job done, but no more, and avoids unnecessary complexity.

### Maintainable

Maintainable code is easy to change without breaking unrelated behavior. It stays understandable and retains the properties of correctness and simplicity as the codebase grows.
