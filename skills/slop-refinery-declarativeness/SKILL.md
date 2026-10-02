---
name: slop-refinery-declarativeness
description: Defines what declarative means, in general and specifically for code, and reports every departure of a target from it. Use when writing or reviewing code, schemas, file and directory names, or any artifact that should say what, not how.
---

UNDER_REVIEW is the target.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

Declarative means a reader learns what a part does from its name, sees what it is made of in the names its body composes, and descends only to learn how. Each level is written in the names of the level below, until a body is written in the primitives of its medium; even that leaf is named for what it accomplishes, not how. Where the medium can state a rule directly, as a type, a constraint, a query, or a declaration, the rule is stated there rather than computed.

In code, each function body reads like a short paragraph at one level of abstraction: each statement binds a descriptively named value or calls a descriptively named function. A leaf function performs one mechanism. Values, functions, files, and directories are named for what they are.

A name or part earns its place by telling the reader something. One that adds nothing is as wrong as mechanics left exposed.

Report every departure, each with its remedy:

- Mechanics worked out step by step where a named part or a construct of the medium could state the result: state it directly.
- A name that does not say what its part does: rename it.
- A name or part that tells the reader nothing: inline it.
