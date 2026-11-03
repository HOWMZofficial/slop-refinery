---
name: slop-refinery-immutability
description: Defines what immutable means, in general and specifically for code, and reports every departure of a target from it, in either direction. Use when writing or reviewing code, state management, data flow, or any artifact whose values change over time.
---

UNDER_REVIEW is the target.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

Immutable means values in UNDER_REVIEW do not change after they are made, and functions compute results from their inputs without changing anything outside themselves. State that must persist or be shared lives at a boundary, such as a store, a database, or the edge of the UI, and everything between boundaries is pure. Mutation is the exception: it exists only where it is justified, such as by performance that matters or by clarity, it is marked as mutation, and it is contained in the smallest scope that owns it. Preference is not a justification, and neither is purity bought at a cost the reader cannot see.

In code, bindings are constant, types are read-only where the medium allows, and a function returns a new value rather than changing one it was given. A mutable binding or mutating operation is marked as such, by the language's keyword or by a name that says so, and stays inside the function that owns it.

Report every departure, each with its remedy:

- A value changed after it is made where a new value would serve as well: make it a new value.
- A function that changes something outside itself where it could return a result: make it pure and apply the result at the boundary.
- A mutable value reachable from more than one place: move it behind a boundary that owns it.
- Justified mutation that is unmarked or wider than its owner: mark it and narrow it.
- Immutability bought at a cost the reader cannot see, such as copying a large structure to avoid one local mutation: mutate locally, marked and contained.
