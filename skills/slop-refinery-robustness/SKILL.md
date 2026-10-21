---
name: slop-refinery-robustness
description: Improves an implementation through repeated reviews of design simplicity, security, edge cases, UI/UX, performance, and tests. Use when strengthening an implementation.
---

UNDER_REVIEW is the implementation selected by the user or calling workflow. Use its agreed requirements and load; ask for missing information needed to review it.

Run these skills on UNDER_REVIEW in this order:

1. [slop-refinery-irreducible-simplicity](../slop-refinery-irreducible-simplicity/SKILL.md), focused on UNDER_REVIEW's design: its components, responsibilities, interactions, and data.
2. [slop-refinery-security](../slop-refinery-security/SKILL.md).
3. [slop-refinery-edge-cases](../slop-refinery-edge-cases/SKILL.md).
4. [slop-refinery-frontend-ui-ux](../slop-refinery-frontend-ui-ux/SKILL.md).
5. [slop-refinery-performance](../slop-refinery-performance/SKILL.md), using the agreed load as LOAD.
6. [slop-refinery-automated-testing](../slop-refinery-automated-testing/SKILL.md).

The called skills report findings; this skill applies fixes. After each review, use [slop-refinery-human-judgment](../slop-refinery-human-judgment/SKILL.md) to classify its findings and anything it could not verify, using the agreed requirements and load. Fix every finding classified as AI. Leave human decisions and blockers unresolved and continue independent work.

Keep track of resolved findings and their reasons across passes. Do not repeat or reverse a resolved change without new evidence. Resolve conflicting reviews against the agreed requirements before editing again. Classify unresolved conflicts using [slop-refinery-human-judgment](../slop-refinery-human-judgment/SKILL.md).

After any change, run the repository's required static checks and restart from the first skill. Stop after a full pass makes no changes. Report what you fixed, any remaining human choices with their consequences, and anything you could not verify. Unfinished checks are not passes.
