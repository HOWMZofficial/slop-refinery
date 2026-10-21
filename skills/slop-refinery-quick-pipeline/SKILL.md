---
name: slop-refinery-quick-pipeline
description: Puts the work on a feature branch with an open PR, then runs slop-refinery-code-cleanliness, slop-refinery-robustness, and slop-refinery-final-checks in order. Use only when invoked explicitly.
---

UNDER_REVIEW is everything the branch changes relative to `origin/main`. Its agreed requirements, design, and load are what the user has stated and what the PR and any linked issue record.

1. Make sure the work is committed and pushed on a feature branch that has an open PR whose description states the intended behavior.
2. Run [slop-refinery-code-cleanliness](../slop-refinery-code-cleanliness/SKILL.md) on UNDER_REVIEW.
3. Run [slop-refinery-robustness](../slop-refinery-robustness/SKILL.md) on UNDER_REVIEW.
4. Make sure every fix is committed and pushed, then complete every final check in [slop-refinery-final-checks](../slop-refinery-final-checks/SKILL.md).

Finish with one report: what you fixed, every remaining human decision, and every blocker.
