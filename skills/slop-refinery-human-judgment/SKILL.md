---
name: slop-refinery-human-judgment
description: Classifies review findings as AI work, human decisions, or blockers. Use after reviews to decide what the AI can resolve and what only the human can answer.
---

Use the candidate findings, their evidence, the agreed requirements and plan, and repository standards.

Distinguish agreed requirements from reviewer assumptions. If a proposed fix would introduce a restriction, narrow supported environments, or change a workflow based on an assumption not established by the user's request, prior decisions, or repository standards, classify it as Human. A technical benefit does not by itself establish a new requirement.

Classify and report only. Do not apply fixes, edit repository files, change Git state, or update the PR. The calling workflow owns fixes, publication, and when to pause.

Dismiss findings that are wrong or not worth acting on, unless doing nothing would itself settle a choice that belongs to the human. Do not raise a human decision when an in-scope fix resolves the finding; needing permission for an unnecessary change is not a reason to propose it. Classify every finding that remains:

1. AI: You can fix it well within the agreed requirements and plan, without choosing among materially different outcomes that those agreements and repository standards leave unresolved. The size or difficulty of the fix, or low confidence alone, does not make it a human decision. Investigate uncertainty within the caller's permitted scope.
2. Human: Fixing it well would change or add to the agreed requirements or plan, or credible fixes lead to materially different outcomes and neither those agreements nor repository standards determine which is wanted. A question of which fix is right is yours to settle; a choice of which outcome is wanted belongs to the human.
3. Blocked: Evidence, access, or tools needed to decide or verify are unavailable within the caller's permitted scope. State what is missing. A blocker is not, by itself, a human-judgment finding or a passed check.

Return each finding's classification or dismissal with its reason. For each human decision, explain the finding and evidence, the exact question only the human can answer, why the existing agreements do not answer it, your recommendation with its reason, and the credible choices, including doing nothing when credible, with their consequences.
