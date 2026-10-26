---
name: slop-refinery-irreducible-simplicity
description: Defines what irreducibly simple means, in general and specifically for designs and implementations, and reports every removal or merge that would bring a target to it. Use when writing or reviewing code, designs, plans, or any artifact that should contain nothing its essential requirements do not need.
---

UNDER_REVIEW is the target.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

Irreducibly simple means UNDER_REVIEW cannot be simplified further without losing essential meaning, behavior, or integrity.

In a design, the parts are the system's components, their responsibilities, their interactions, and their data, independent of how any of it is implemented.

In an implementation, this applies in every medium, and in source code at every level, from module to expression.

1. Identify the essential requirements.
2. Identify everything not required by those requirements, to remove or merge.
3. Stop when another removal would break an essential requirement.
4. Report every proposed removal and merge.
