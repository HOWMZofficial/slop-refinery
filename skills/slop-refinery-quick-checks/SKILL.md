---
name: slop-refinery-quick-checks
description: Run all automated checks below and fix resulting problems to quickly ensure some level of code quality and correctness.
---

Use this skill for the fast validation loop after each set of changes an AI makes.

Run the following commands when they exist in the repo, and fix resulting problems. If code changes after running a command, start over at command `1` and rerun the whole sequence until everything is clean.

1. `npm run format`
2. `npm run lint`
3. `npm run typecheck`
