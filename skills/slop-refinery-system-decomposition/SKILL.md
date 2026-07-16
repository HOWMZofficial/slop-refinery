---
name: slop-refinery-system-decomposition
description: Use when an AI is spinning on a solution or making insufficient progress because the problem, intended solution, system concepts, or dependencies are not understood well enough yet.
---

# System Decomposition

Use this skill to recover from stalled reasoning by building shared understanding before trying another solution.

## Goal

Make the highest-level solution apparent by decomposing the problem into the smallest useful concept graph and understanding one concept at a time.

## Workflow

1. Stop the current solution attempt. State the specific stall in one sentence.
2. Ask the user about the intended solution:
    - What problem are we trying to solve?
    - What solution direction do you currently expect?
    - What part feels unclear, risky, or stuck?
3. Restate the highest-level problem in one sentence. Do not continue until the user agrees or corrects it.
4. Create a first-layer concept graph for that problem:
    - Use `Problem -> concept -> dependency` text, a short tree, or Mermaid.
    - Keep only concepts needed to explain the solution.
    - Mark uncertain nodes or edges with `?`.
5. Visit the graph one concept at a time.
    - Explain the current concept's role in the highest-level problem.
    - Identify its dependencies.
    - Ask the user to confirm, correct, or add missing context.
6. Decide whether the current concept is understood.
    - Understood means the AI and user can state its purpose, dependencies, constraints, and relationship to the highest-level problem.
    - If understood, mark it complete and move to the next concept at the same level.
    - If not understood, decompose only that concept one layer deeper and repeat this workflow for its child concepts.
    - After its child concepts are understood, restate the parent concept and return to the next concept in the layer above.
7. Continue until every concept needed for the highest-level problem is understood.
8. When the solution becomes apparent, summarize:
    - the agreed highest-level problem
    - the final concept graph
    - the insight that made the solution apparent
    - the proposed next action

## Guardrails

- Do not expand the whole graph speculatively. Add child concepts only when the current concept is not understood.
- Do not jump between unrelated concepts. Keep one active focus.
- Do not treat agreement as complete understanding. Use concrete dependencies and constraints.
- Do not implement while the current concept is still confused, unless the user explicitly redirects.
- Keep the graph small enough that the user can correct it quickly.
