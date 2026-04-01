---
name: automated-checks
description: Run all automated checks and fix resulting problems to automatically ensure some code quality and correctness.
---

Run the following commands when they exist in the repo, and fix any resulting problems. If code changes after running a command, start over at command `1` and rerun the whole sequence until everything is clean.

1. `npm run format`
2. `npm run lint`
3. `npm run typecheck`
