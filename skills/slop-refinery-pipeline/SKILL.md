---
name: slop-refinery-pipeline
description: Implement a feature through an effective and efficient software factory pipeline. Use only when invoked explicitly.
---

Pause for the human only at steps 6, 7, and 14. Everywhere else, proceed without asking, through marking the PR ready and enabling auto-merge.

## Setup

1. Create a feature branch.
2. Update the branch with the latest `origin/main` and verify that it is not behind.
3. Create and push an empty commit so a PR can be opened.
4. Open a draft PR. Start its description with the unchanged contents of `pull-request-template.md` from this skill's directory. Its boxes track progress: check each when its step completes or does not apply, and each section only after all its steps are complete. On resuming, continue from the first unchecked box.
5. Link the correct issue in the PR's Development section so merging closes it. Use the issue supplied with the skill, otherwise an existing matching issue, otherwise a new issue.

## Deliberation

6. Lead deliberation, asking questions and guiding the conversation until you and the human agree on the full problem and an irreducibly simple, complete plan. The plan describes intended behavior, expected load, and meaningful tradeoffs; choose technical implementation details yourself. Review the proposed plan for foreseeable issues and use [slop-refinery-human-judgment](../slop-refinery-human-judgment/SKILL.md) to identify what you can resolve, what needs a human decision, and what is blocked. Discuss the human decisions and resolve blockers needed to agree on the plan. Record each agreement in the linked issue's `# Agreed plan` section; that issue is the source of truth, linked from the PR description. Keep guiding the next unresolved decision. When the plan is agreed and recorded, tell the human deliberation is complete.

## Implementation

7. Ask for permission to implement. After approval, implement the entire agreed plan.
8. Commit and push every intended change.
9. Wait for every CI/CD check that applies to a draft PR to pass on the current commit. Handle static security findings with [slop-refinery-static-security-analysis](../slop-refinery-static-security-analysis/SKILL.md). Do the following in a loop: fix failures, push the fixes, and wait again.

## AI Review

10. Run these thirteen reviews in parallel with fresh, independent subagents. Read the current agreed plan from the linked issue and give each subagent that plan and only the description of its own review. The implementation it reviews is everything the branch changes relative to `origin/main`. Start the application once before dispatching and tell each subagent it is running and not to restart it. Each subagent should only produce candidate findings with evidence and anything it could not check; it changes nothing in the repository, in Git, or on the PR:
    1. Backward compatibility: Using the agreed plan as the requirements, find every departure of the implementation from the standard in `slop-refinery-backward-compatibility`.
    2. Manual testing: Find every departure of the implementation from the standard in `slop-refinery-manual-testing`.
    3. Automated testing: Find every departure of the implementation from the standard in `slop-refinery-automated-testing`.
    4. System design irreducible simplicity: Find every departure of the design from the standard in `slop-refinery-irreducible-simplicity`.
    5. Implementation irreducible simplicity: Taking the agreed design as given, find every departure of the implementation from the standard in `slop-refinery-irreducible-simplicity`.
    6. Edge cases: Find every departure of the implementation from the standard in `slop-refinery-edge-cases`.
    7. Declarativeness: Find every departure of the implementation from the standard in `slop-refinery-declarativeness`.
    8. Modularity: Find every departure of the implementation from the standard in `slop-refinery-modularity`.
    9. Immutability: Find every departure of the implementation from the standard in `slop-refinery-immutability`.
    10. Abstractness: Find every departure of the implementation from the standard in `slop-refinery-abstractness`.
    11. Performance: Using the load in the agreed plan, find every departure of the implementation from the standard in `slop-refinery-performance`.
    12. Security: Find every departure of the implementation from the standard in `slop-refinery-security`.
    13. Frontend UI/UX: Find every departure of the implementation from the standard in `slop-refinery-frontend-ui-ux`.
11. Run [slop-refinery-human-judgment](../slop-refinery-human-judgment/SKILL.md) once on all review findings and anything the reviewers could not verify, using the agreed plan.
12. Automatically fix every finding classified as AI, then commit and push.
13. For each finding classified as Human or Blocked, add an unchecked checkbox to the `# Findings requiring human judgment` section of the PR description. Give it a short title and these indented bullets:
    - Description: What was found, the evidence, what the human must decide or provide, and why the AI cannot resolve it. For a blocker, say what is missing and what cannot be completed.
    - Recommendation: What you recommend doing and why.
    - Choices and consequences: Every credible choice, including doing nothing when credible, and what each choice would change.

    The human must be able to decide or unblock every finding by reading the PR alone.

## Human Review

14. Invite the human to review and test the implementation. Discuss each finding together and agree on what to do. Carry out the decision, update the linked issue if the agreed plan changes, complete any blocked checks, record the result, and then check off the finding.

## Final Checks

15. Once the human has finished reviewing and every checkbox in `# Findings requiring human judgment` has been checked off, complete every final check in `slop-refinery-final-checks`. Check its box in the PR description only after it passes or does not apply.

## Production

16. After every checkbox from the checklist and every checkbox in `# Findings requiring human judgment` is checked, mark the PR ready. Wait for every PR CI/CD check to pass on the final commit, handling failures as in `slop-refinery-final-checks` step 6, then enable auto-merge.
