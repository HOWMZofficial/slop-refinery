---
name: slop-refinery-abstractness
description: Defines the right level of abstraction, in general and specifically for code, and reports every departure of a target from it, in either direction. Use when writing or reviewing code, types, interfaces, schemas, or any artifact organized around named concepts.
---

UNDER_REVIEW is the target.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

Abstract at the right level means UNDER_REVIEW is organized around concepts that are real, right-sized, and few enough to follow. A concept is real when a reader can name what it stands for and use it correctly without opening it. It is right-sized when it generalizes over exactly what varies among its actual uses: less, and the concept is written out again wherever it varies; more, and it carries generality nothing exercises. Two pieces are one concept when they change together; when they only look alike, they are two.

Too little abstraction is imperative: the reader sees every step and re-derives the concept each time it appears. Too much is opaque: one concept hides everything, or so many concepts interact that no one can follow them.

In code, an abstraction is anything that stands for a concept and hides how it works, such as a function, type, module, interface, or component. A concept is given one when it appears in more than one place or is stable enough to deserve a name, and it is parameterized only over what its uses actually vary.

Report every departure, each with its remedy:

- One concept written out in more than one place, so that changing it means changing each: name it once.
- An abstraction more general than its uses, such as a parameter with one value or an interface with one implementation: narrow it to what varies.
- An abstraction that stands for no concept a reader can name, hiding unrelated things under one word: dissolve it into the concepts it hides.
- An abstraction the reader must open to use correctly: make its contract say what it hides, or inline it.
- Pieces that only look alike, joined into one abstraction that must be bent to fit each: separate them into their own concepts.
