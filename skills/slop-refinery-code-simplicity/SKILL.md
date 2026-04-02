---
name: slop-refinery-code-simplicity
description: Produce the most simple and concise source code that still solves the correct problem.
---

## Inputs and Outputs

- Input: `SOURCE_CODE` (the scope to simplify: a directory, file(s), class, function, block, or even a single line)
- Generate `RUN_ID` in UTC format: `YYYYMMDDTHHMMSSZ`
- `RUN_DIR`: `.slop-refinery/code_simplicity/<RUN_ID>/`
- `CODE_STRUCTURE_FILE_PATH`: `.slop-refinery/code_simplicity/<RUN_ID>/code_structure.md`
- `CODE_HIERARCHY_RIGOR`: default `file` (can be overridden to `directory`, `function`, or `statement`)
- `CODE_HIERARCHY_GENERATION_COMMAND`: `npx tsx <path-to-slop-refinery-code-simplicity-skill>/scripts/generate-code-hierarchy.ts --source "<SOURCE_CODE>" --rigor "<CODE_HIERARCHY_RIGOR>" --output "<CODE_STRUCTURE_FILE_PATH>"`
- `PRINCIPLE_FILE_PATH(i)`: `.slop-refinery/code_simplicity/<RUN_ID>/principle_<i>.md` where `i` is the numeric identifier in the principle title (e.g., `### Principle 2: ...` gives `i = 2`)
- `SUBAGENT_CONTEXT_DIR`: `.slop-refinery/code_simplicity/<RUN_ID>/subagent_context/`
- `SUBAGENT_RESULT_DIR`: `.slop-refinery/code_simplicity/<RUN_ID>/subagent_results/`
- `CHECKBOX_ID_SAFE`: `CHECKBOX_ID` with dots replaced by underscores (for filenames)
- `SUBAGENT_CONTEXT_FILE_PATH(i, CHECKBOX_ID_SAFE)`: `.slop-refinery/code_simplicity/<RUN_ID>/subagent_context/principle_<i>__checkbox_<CHECKBOX_ID_SAFE>.md`
- `SUBAGENT_RESULT_FILE_PATH(i, CHECKBOX_ID_SAFE)`: `.slop-refinery/code_simplicity/<RUN_ID>/subagent_results/principle_<i>__checkbox_<CHECKBOX_ID_SAFE>.md`
- `IMPLEMENTATION_CONTEXT_FILE_PATH`: `.slop-refinery/code_simplicity/<RUN_ID>/implementation_context.md`
- `IMPLEMENTATION_RESULT_FILE_PATH`: `.slop-refinery/code_simplicity/<RUN_ID>/implementation_result.md`

## Execution Mode (Non-Negotiable)

- Execute in two phases:
    - `Phase A (Analysis)`: maximum-parallel checkbox analysis across all principles with no source-code edits.
    - `Phase B (Implementation)`: parent agent applies required code changes (no subagents).
- Generate all `principle_<i>.md` files first, before evaluating any checkbox.
- Build a full checkbox worklist across all principle files, then dispatch one fresh analysis subagent per checkbox in parallel to the maximum supported concurrency.
- Never invoke `codex exec` or any shell wrapper script for checkbox evaluation.
- Treat each subagent as stateless. Subagents do not inherit parent chat context; pass all required context through the subagent context file and repository files.
- In `Phase A`, pass exactly one principle + one checkbox scope per subagent invocation.
- In `Phase B`, parent uses one consolidated implementation scope directly.
- During `Phase A`, analysis subagents must not modify source code and must not edit checklist files directly.
- During `Phase B`, parent may modify source code for approved `DELETE`/`SIMPLIFY` items; it must update checklist rows one target checkbox at a time.
- Parent updates checklist rows one target checkbox at a time after validating each result file.
- Never skip checkbox-level decisions; every checkbox must receive an explicit decision record.

## Numbered Checklist Format (Required)

- Use hierarchical integer checkbox IDs.
- Top-level rows are numbered `1`, `2`, `3`, ...
- At each indentation level, numbering starts at `1` within that parent scope.
- Child rows append with dots, for example: `1.1`, `1.2`, `1.2.1`, `1.2.1.1`.
- Every checklist row must include exactly one checkbox ID token in square brackets.
- Required unresolved row format:
    - `- [ ] [1] File login/admin_login.ts`
    - `- [ ] [1.1] Top-level function handler`
    - `- [ ] [1.1.1] Top-level function validateInput`
- Required resolved row formats:
    - `- [x] [1.1] (KEEP) Top-level function handler`
    - `- [ ] [1.2] (DELETE) Top-level function legacy - <planned deletion>`
    - `- [ ] [1.3] (SIMPLIFY) Top-level function handler - <planned simplification>`
    - `- [ ] [1.4] (DEFER) Top-level function x - <reason>; unblock: <condition>`

## Checklist Serialization Guardrails (Required)

- Write checklist content as plain text lines; each checklist row must be rendered literally in Markdown.
- Never interpolate raw objects/arrays into checklist output.
- `CODE_STRUCTURE_FILE_PATH` and all `PRINCIPLE_FILE_PATH(i)` files must not contain serialization placeholder text such as `System.Object[]`, `[object Object]`, or similar object dump tokens.
- Before moving past checklist generation, validate all of the following:
    - At least one unresolved checkbox row exists with ID format `- [ ] [1] ...`.
    - Checkbox IDs are valid hierarchical IDs and follow numbering order.
    - If hierarchy rows have children, nested IDs exist (for example `[1.1]`).
    - The hierarchy output matches the selected `CODE_HIERARCHY_RIGOR`.
    - No serialization placeholder text exists anywhere in checklist sections.
- If any validation fails, stop immediately, create a new `RUN_ID`, regenerate artifacts, and re-validate before evaluation.

## Invalid Run Conditions (Must Restart)

- Any `Phase A` checkbox decision is made without a subagent invocation.
- Any checkbox evaluation uses `codex exec`, `run_checkbox_workers.ts`, or another shell wrapper instead of the built-in subagent/task capability.
- Any analysis subagent edits source code.
- Any implementation subagent is used in `Phase B`.
- A subagent run causes checklist edits outside the target checkbox ID.
- Checklist states are updated using global replace/regex/batch transforms.
- The agent cannot explain a specific checkbox decision with local code context on request.
- Any `SIMPLIFY` or `DELETE` row remains unchecked (`- [ ]`) at end of run.
- `CODE_STRUCTURE_FILE_PATH` was hand-authored instead of generated using `CODE_HIERARCHY_GENERATION_COMMAND`.
- `CODE_STRUCTURE_FILE_PATH` or any `PRINCIPLE_FILE_PATH(i)` contains serialization placeholder text (for example `System.Object[]`) instead of checklist rows.
- Generated checklist does not match selected `CODE_HIERARCHY_RIGOR`, or has malformed checkbox ID hierarchy.

If any invalid condition is detected, create a new `RUN_ID` and restart.

## Required Checkbox Decision Logging

The checkbox rows are the decision log. Each resolved row must contain the final decision and local evidence inline:

- `KEEP` example:
    - `- [x] [1.1] (KEEP) Top-level function handler - reason: required auth boundary; evidence: login route entrypoint`
- `DELETE` example:
    - Analysis: `- [ ] [1.2] (DELETE) Legacy helper - reason: dead path; evidence: no callsites in auth scope; implementation: remove helper and callsites`
    - Final after implementation: `- [x] [1.2] (DELETE) Legacy helper - reason: dead path; evidence: no callsites in auth scope; implementation: removed helper and callsites`
- `SIMPLIFY` example:
    - Analysis: `- [ ] [1.3] (SIMPLIFY) Top-level function handler - reason: branch reduced and helper inlined; evidence: fewer branches in function body; implementation: inline helper and collapse branches`
    - Final after implementation: `- [x] [1.3] (SIMPLIFY) Top-level function handler - reason: branch reduced and helper inlined; evidence: fewer branches in function body; implementation: helper inlined and branches collapsed`
- `DEFER` example:
    - `- [ ] [1.4] (DEFER) Top-level function x - reason: external dependency unknown; unblock: confirm contract with owner`

Rules:

- `reason` must be specific to the active principle and checkbox context; generic boilerplate is invalid.
- `evidence` must name concrete code locations (file + construct) for `KEEP`, `DELETE`, and `SIMPLIFY`.
- `implementation` is required for `DELETE` and `SIMPLIFY` rows and must describe the intended or completed change.
- `DEFER` rows must include an unblock condition.
- Every checkbox must end with one explicit final state in file order.
- `KEEP` is checked during analysis.
- `DELETE` and `SIMPLIFY` are unchecked during analysis and become checked only after `Phase B` implementation completes.
- `DEFER` remains unchecked.

## Subagent Dispatch (Required)

Use one fresh analysis subagent per checkbox during `Phase A`. Do not use subagents in `Phase B`.

Subagent contract:

- `Phase A`:
    - Parent creates `SUBAGENT_CONTEXT_FILE_PATH(i, CHECKBOX_ID_SAFE)` for every checkbox.
    - Parent dispatches all checkbox analysis subagents in parallel to maximum supported concurrency.
    - Each analysis subagent handles exactly one checkbox and writes exactly one `SUBAGENT_RESULT_FILE_PATH(i, CHECKBOX_ID_SAFE)`.
    - Analysis subagents must not edit source code or checklist rows.
- `Phase B`:
    - Parent creates one implementation context containing all `DELETE`/`SIMPLIFY` decisions from analysis.
    - Parent applies source-code changes for approved `DELETE`/`SIMPLIFY` items directly (no subagent).
    - Parent writes `IMPLEMENTATION_RESULT_FILE_PATH`.
- Parent validates result files, then updates checklist rows one target checkbox ID at a time.

`SUBAGENT_CONTEXT_FILE_PATH` required sections:

- Principle header: `Principle <i>: <title>`
- Principle description text copied from `PRINCIPLE_FILE_PATH(i)`
- Target checkbox ID and unresolved row text
- Target scope path from hierarchy root to target checkbox
- Allowed edit scope: concrete source file path(s) for that checkbox only
- Result schema reminder for `SUBAGENT_RESULT_FILE_PATH`
- `mode`: `analysis`

`SUBAGENT_RESULT_FILE_PATH` required format (`mode: analysis`):

- `checkbox_id: <CHECKBOX_ID>`
- `decision: KEEP|DELETE|SIMPLIFY|DEFER`
- `reason: <specific reason>`
- `evidence: <file + construct>` (required for `KEEP`, `DELETE`, `SIMPLIFY`)
- `implementation: <required/completed change>` (required for `DELETE`, `SIMPLIFY`)
- `unblock: <condition>` (required for `DEFER`)
- Optional `code_changes: <short summary>`

`IMPLEMENTATION_RESULT_FILE_PATH` required format:

- `implemented_checkbox_ids: <comma-separated checkbox IDs>`
- `deferred_checkbox_ids: <comma-separated checkbox IDs not completed>`
- `code_changes: <short summary>`
- `notes: <risks or follow-ups>`

Run validation requirements:

- Pre-run: target checkbox exists and is unresolved.
- Post-run: no checklist row is edited directly by subagents.
- Post-run (`Phase A`): target row is updated by parent only, with required inline fields and analysis-phase check state (`KEEP` checked; `DELETE`/`SIMPLIFY` unchecked; `DEFER` unchecked).
- Post-run (`Phase B`): parent flips completed `DELETE`/`SIMPLIFY` rows to checked with completed `implementation` details.
- Pre/post-run: no serialization placeholder text.

## Coverage Math Gate (Required)

Before completion, compute and validate:

- `PRINCIPLE_COUNT`: number of discovered principle sections (`### Principle <i>: ...`); this skill currently expects `22`.
- `CHECKBOX_COUNT`: number of checklist rows in `CODE_STRUCTURE_FILE_PATH`.
- `REQUIRED_DECISIONS = PRINCIPLE_COUNT * CHECKBOX_COUNT`.
- Every `PRINCIPLE_FILE_PATH(i)` has the exact same checkbox ID list and order as `CODE_STRUCTURE_FILE_PATH`.
- Every checkbox row in every principle file is terminal:
    - checked `KEEP`/`DELETE`/`SIMPLIFY` with `reason:` and `evidence:`
    - or unchecked `DEFER` with `reason:` and `unblock:`
- Total terminal decisions across all principle files equals `REQUIRED_DECISIONS`.

## Workflow

1. Create `RUN_DIR`.
2. Create `CODE_STRUCTURE_FILE_PATH`.
3. Generate `CODE_STRUCTURE_FILE_PATH` by running `CODE_HIERARCHY_GENERATION_COMMAND`. This command performs deterministic traversal and structure extraction for the selected `CODE_HIERARCHY_RIGOR`.
4. Validate `CODE_STRUCTURE_FILE_PATH` serialization and hierarchy depth per "Checklist Serialization Guardrails (Required)".
5. Discover `PRINCIPLES` as all sections whose heading matches `### Principle <i>: ...`.
6. For each discovered principle section (file generation pass only):
    1. Read `i` from the principle title number.
    2. Create `PRINCIPLE_FILE_PATH(i)`.
    3. Copy the principle description into that file.
    4. Append the full numbered checklist from `CODE_STRUCTURE_FILE_PATH`.
    5. Verify the copied checklist matches the source checklist exactly, including IDs and line count.
    6. Verify no serialization placeholder text exists in the generated principle file.
7. Build a global worklist of all unresolved checkboxes across all `PRINCIPLE_FILE_PATH(i)` files.
8. `Phase A (Parallel Analysis)`:
    1. For every worklist checkbox, build `CHECKBOX_ID_SAFE` and create `SUBAGENT_CONTEXT_FILE_PATH(i, CHECKBOX_ID_SAFE)` with `mode: analysis`.
    2. Dispatch one fresh analysis subagent per checkbox in parallel at maximum supported concurrency.
    3. Wait for all analysis subagents to complete.
    4. Read and validate each `SUBAGENT_RESULT_FILE_PATH(i, CHECKBOX_ID_SAFE)`.
    5. Parent applies each validated result to exactly one checklist row (target checkbox ID only).
9. Verify every checkbox in every principle file has an analysis decision (`KEEP`/`DELETE`/`SIMPLIFY`/`DEFER`) and required fields.
10. Build one implementation context from all analysis rows marked `DELETE` or `SIMPLIFY`.
11. `Phase B (Parent Implementation)`:
    1. Create `IMPLEMENTATION_CONTEXT_FILE_PATH` from analysis rows marked `DELETE` or `SIMPLIFY`.
    2. Parent applies source-code changes for planned `DELETE`/`SIMPLIFY` items (no subagent) and writes `IMPLEMENTATION_RESULT_FILE_PATH`.
    3. Parent validates `IMPLEMENTATION_RESULT_FILE_PATH` and updates only corresponding checklist rows from unchecked to checked for completed `DELETE`/`SIMPLIFY` items.
12. Run the "Coverage Math Gate (Required)" checks.
13. If a `Phase A` subagent run fails, edits disallowed files, or fails coverage math, fix the root cause and restart from a fresh `RUN_ID`.
14. Run `npm run typecheck`, `npm run format`, `npm run lint`, `npm test`.

## Completion Criteria

- Every principle file was generated before checkbox evaluation began.
- `Phase A` completed with maximum-parallel checkbox analysis and no source-code edits by analysis subagents.
- Every checkbox has an explicit analysis decision with required fields (`reason`, `evidence`, and `implementation` where required).
- Parent performed all source-code edits for planned `DELETE`/`SIMPLIFY` actions in `Phase B` (no implementation subagent).
- Every checklist item ends as checked `KEEP`/`DELETE`/`SIMPLIFY` or unchecked `DEFER` with reason and unblock condition.
- No skipped checkbox decisions: each item has an explicit action in file order.
- Checklist rows themselves contain the final decision rationale/evidence per checkbox.
- All checklist IDs remain unique and stable.
- No serialization placeholder text appears in checklist sections.
- Checklist hierarchy is valid for the selected `CODE_HIERARCHY_RIGOR`.
- Coverage math gate passes: total terminal decisions equals `PRINCIPLE_COUNT * CHECKBOX_COUNT`.
- No invalid run conditions occurred.
- `npm run typecheck`, `npm run format`, `npm run lint`, and `npm test` all pass.
- Resulting code is simpler by structure (fewer moving parts, less branching, less duplication) while preserving required behavior.

## Principles

### Principle 1: Make the requirements less dumb

Elon Musk says, "make your requirements less dumb." Treat every requirement as a draft that may contain hidden assumptions, stale constraints, or plain mistakes. Before changing code, challenge each requirement until it is concrete, testable, and tied to a real outcome. Give every requirement a named owner (a person, not a team label) so tradeoffs can be resolved quickly and accountability is clear.

When applying this principle to code simplification:

- Identify the exact user or system outcome each requirement is meant to protect.
- Remove vague language and rewrite requirements as observable behavior.
- Distinguish hard constraints (security, legal, safety, data integrity) from preferences.
- Reject "because we always do it this way" as justification.
- Only proceed once the problem statement is specific enough to verify with tests.

### Principle 2: Delete the part or process

Elon Musk says, "try very hard to delete the part or process." After requirements are corrected, aggressively remove code, process steps, and interfaces that do not clearly earn their existence. Prefer subtraction before improvement. If deletion never forces you to restore anything, you likely were not deleting deeply enough.

When applying this principle to code simplification:

- Remove duplicate logic, unnecessary wrappers, dead paths, and "just in case" branches.
- Collapse over-segmented workflows where intermediate steps add no value.
- Eliminate handoffs, approvals, or checks that are not tied to a real risk.
- Keep a short rationale for each retained non-obvious part.
- Re-add only what is proven necessary by failing behavior, tests, or constraints.

### Principle 3: Simplify or optimise the design

Elon Musk says, "only the third step is simplify or optimize." Only simplify and optimize what survives principles 1 and 2. The goal is to reduce moving parts and cognitive load first, then improve performance or throughput where measurement shows it matters. Optimizing the wrong thing is waste; simplifying the right thing compounds.

When applying this principle to code simplification:

- Favor fewer concepts, fewer transformations, and fewer conditional branches.
- Prefer straightforward data flow over layered indirection.
- Optimize bottlenecks only after measuring them.
- Keep interfaces small and explicit to reduce accidental complexity.
- Re-check that each optimization still serves the validated requirement, not legacy inertia.

### Principle 4: DRY (Don't Repeat Yourself)

DRY means each piece of system knowledge should live in one authoritative place. Eliminate duplication of behavior and rules that can drift out of sync, not just repeated text.

When applying this principle to code simplification:

- Keep business rules, schemas, and mappings in one source of truth.
- Remove duplicated logic that must evolve together.
- Avoid abstracting trivial repetition that does not encode shared knowledge.

### Principle 5: KISS (Keep It Simple, Stupid)

KISS favors the clearest solution that solves the problem without extra mechanism. When two options work, choose the one that is easier to read, debug, and maintain.

When applying this principle to code simplification:

- Prefer straightforward control flow over clever indirection.
- Minimize framework and architectural complexity.
- Optimize for maintainability before elegance.

### Principle 6: YAGNI (You Ain't Gonna Need It)

YAGNI says do not build speculative functionality before it is needed. Premature capability usually adds complexity now and value never.

When applying this principle to code simplification:

- Implement only requirements backed by current use cases.
- Delay extension points until real variation appears.
- Remove unused hooks and "future" scaffolding.

### Principle 7: Principle of Least Astonishment

Design behavior so users and maintainers can predict outcomes from names and context. Surprise should be treated as design debt.

When applying this principle to code simplification:

- Align defaults and naming with common expectations.
- Make side effects explicit at API boundaries.
- Prefer explicit failure modes over hidden behavior.

### Principle 8: WET (Write Everything Twice)

WET is a tongue-in-cheek anti-pattern that warns against over-abstraction. It is useful only as a reminder that premature abstraction can be worse than temporary duplication.

When applying this principle to code simplification:

- Allow short-lived duplication while patterns are still unclear.
- Abstract only when duplication becomes stable and meaningful.
- Revisit repeated code once change pressure appears.

### Principle 9: Single Responsibility Principle (SRP)

SRP means a module should have one reason to change. If different stakeholders or concerns drive changes to the same code, split responsibilities.

When applying this principle to code simplification:

- Separate domain logic, persistence, and delivery concerns.
- Keep modules focused on one cohesive purpose.
- Refactor files that change for unrelated reasons.

### Principle 10: Separation of Concerns (SoC)

SoC divides software into clear concern boundaries so each part can evolve independently. This reduces coupling and mental overhead.

When applying this principle to code simplification:

- Isolate UI, orchestration, and domain rules.
- Keep cross-cutting behavior explicit at boundaries.
- Prevent leakage of low-level details into high-level logic.

### Principle 11: Command-Query Separation (CQS)

CQS states that operations should either change state or return data, not both. This keeps intent explicit and reduces hidden side effects.

When applying this principle to code simplification:

- Keep queries free of observable mutations.
- Keep commands focused on state changes.
- Split mixed methods that both mutate and return computed reads.

### Principle 12: Law of Demeter (Principle of Least Knowledge)

LoD says objects should talk only to close collaborators, not deep object graphs. This lowers coupling and protects encapsulation.

When applying this principle to code simplification:

- Avoid chained calls into internals you do not own.
- Move behavior closer to the data it uses.
- Expose narrow interfaces instead of structural traversal.

### Principle 13: AHA (Avoid Hasty Abstractions)

AHA warns against abstracting before patterns are mature. Kent C. Dodds popularized this framing as a counterbalance to premature DRY.

When applying this principle to code simplification:

- Delay abstraction until recurring patterns are stable.
- Prefer concrete examples before generalization.
- Inline brittle abstractions that proved premature.

### Principle 14: ETC (Easier to Change)

From The Pragmatic Programmer, ETC frames quality around adaptability. Good design is design that can change safely with low friction.

When applying this principle to code simplification:

- Choose low-coupling structures with small blast radius.
- Favor reversible decisions and explicit boundaries.
- Keep modules small enough to refactor confidently.

### Principle 15: DTSTTCPW (Do The Simplest Thing That Could Possibly Work)

From XP, this principle says implement the minimal working solution first, then iterate. It prioritizes learning and feedback over speculative design.

When applying this principle to code simplification:

- Build the smallest solution that satisfies today's need.
- Verify with tests and real behavior quickly.
- Refactor when evidence demands more complexity.

### Principle 16: MVP (Minimum Viable Product)

MVP means shipping the smallest useful slice that produces real learning. Scope is constrained to value delivery and feedback speed.

When applying this principle to code simplification:

- Deliver a thin end-to-end path before extras.
- Measure real user outcomes before expansion.
- Defer non-essential enhancements until validated.

### Principle 17: Occam's Razor (Applied to Code)

Among solutions that work, prefer the one with fewer assumptions and moving parts. Extra complexity needs explicit justification.

When applying this principle to code simplification:

- Compare designs by assumptions introduced.
- Remove optional branches that add little value.
- Prefer simple data flow and minimal state.

### Principle 18: Rule of Three

Do not abstract on first duplication; wait until a pattern repeats at least three times. This lowers risk of premature, wrong abstractions.

When applying this principle to code simplification:

- Tolerate early duplication while learning variation.
- Extract after the pattern is clearly recurring.
- Re-check abstractions when new cases diverge.

### Principle 19: Worse Is Better

Richard Gabriel argued that simpler, more deployable systems often win over complex "perfect" ones. Simplicity and practicality can dominate purity in real adoption.

When applying this principle to code simplification:

- Prefer coherent, shippable solutions over maximal completeness.
- Keep strict quality bars for safety and correctness.
- Evolve incrementally rather than over-designing upfront.

### Principle 20: POGNI (Principle of Good Enough)

POGNI emphasizes stopping when the solution is sufficient for current goals. Beyond that point, extra polish often has poor return.

When applying this principle to code simplification:

- Define "good enough" acceptance criteria explicitly.
- Stop once requirements are met with acceptable risk.
- Track deferred improvements intentionally.

### Principle 21: Composition over Inheritance

Composition usually creates flatter, more flexible designs than deep inheritance. The Gang of Four summarized this as "favor object composition over class inheritance."

When applying this principle to code simplification:

- Prefer delegation and interfaces for variation.
- Use inheritance only for true stable is-a relationships.
- Avoid base classes that force unrelated coupling.

### Principle 22: Dead Code Elimination

Unused code increases attack surface, confusion, and maintenance load. Removing dead paths simplifies reasoning and change safety.

When applying this principle to code simplification:

- Delete unreachable branches, unused exports, and stale flags.
- Remove obsolete tests/docs tied to deleted behavior.
- Re-run static analysis and test suites after cleanup.
