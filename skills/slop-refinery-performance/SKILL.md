---
name: slop-refinery-performance
description: Reviews implementation performance against the agreed load. Use when reviewing performance and whether optimizations are justified.
---

UNDER_REVIEW is the implementation. LOAD is the load it must handle.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

At LOAD, find work on the paths UNDER_REVIEW adds or affects that is too slow, too large, repeated, or unbounded, and optimization that LOAD does not justify. Measure when the answer depends on how much.
