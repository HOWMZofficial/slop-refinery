---
name: slop-refinery-modularity
description: Defines what modular means, in general and specifically for code, and reports every departure of a target from it. Use when writing or reviewing code, file and directory structure, packages, services, or any artifact divided into parts.
---

UNDER_REVIEW is the target.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

Modular means UNDER_REVIEW is divided into parts, each with one well-defined responsibility and an explicit interface, and the parts depend on each other only through those interfaces. A part is anything with an inside and an interface, at any scale, such as a function, file, package, or service. The test of a part is that it can be lifted out and placed elsewhere by reconnecting its interface alone: nothing inside it changes, and nothing around it changes except those connections. A part is sized to one responsibility: too large and it holds several; too small and its interface is as large as what it hides.

In code, a module exposes only what other modules need, exposes functions in preference to state, and keeps those functions pure where the medium allows. Mutation is the concern of `slop-refinery-immutability`.

Report every departure, each with its remedy:

- A part with more than one responsibility: split it along them.
- A part that hides nothing, because its interface is as large as its inside or it only forwards to another: merge it into its user.
- A part that reaches another's inside, by depending on its internals or sharing its state, rather than using its interface: route the dependency through the interface, or move the code to where it belongs.
- Parts that depend on each other in a cycle: break the cycle by moving the shared piece out.
- An interface that exposes more than its users need: narrow it.
