---
name: slop-refinery-automated-testing
description: Reviews test coverage, test value, and weakened checks. Use when reviewing automated tests for an implementation.
---

UNDER_REVIEW is the implementation.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

The standard is practical rather than exhaustive assurance that UNDER_REVIEW works. Find every behavior UNDER_REVIEW adds or affects that could break without a test failing, and every test UNDER_REVIEW introduces that costs more than the assurance it provides. Name the smallest set of tests that would meet the standard, preferring property-based tests where a real property exists. Report also every existing check UNDER_REVIEW weakened, whether lint, type, or test.
