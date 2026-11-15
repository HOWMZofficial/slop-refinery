---
name: slop-refinery-code-cleanliness
description: Improves implementation code through repeated simplicity, modularity, abstractness, immutability, and declarativeness reviews. Use when cleaning up code while preserving its agreed behavior and design.
---

UNDER_REVIEW is the code selected by the user or calling workflow. Keep its agreed behavior and design.

Run these skills on UNDER_REVIEW in this order:

1. [slop-refinery-irreducible-simplicity](../slop-refinery-irreducible-simplicity/SKILL.md), focused on the code, taking the agreed design as given.
2. [slop-refinery-modularity](../slop-refinery-modularity/SKILL.md).
3. [slop-refinery-abstractness](../slop-refinery-abstractness/SKILL.md).
4. [slop-refinery-immutability](../slop-refinery-immutability/SKILL.md).
5. [slop-refinery-declarativeness](../slop-refinery-declarativeness/SKILL.md).

The called skills report findings; this skill applies fixes. After each review, use [slop-refinery-human-judgment](../slop-refinery-human-judgment/SKILL.md) to classify its findings and anything it could not verify, using the agreed behavior and design. Fix every finding classified as AI. Leave human decisions and blockers unresolved and continue independent work.

Keep track of resolved findings and their reasons across passes. Do not repeat or reverse a resolved change without new evidence. Resolve conflicting reviews against the agreed behavior and design before editing again. If you cannot resolve the conflict, report it as a blocker.

After any change, run the required repository commands and restart from the first skill. Stop after a full pass makes no changes. Report what you fixed, any remaining human choices with their consequences, and anything you could not verify. Unfinished checks are blockers, not passes.
