---
name: slop-refinery-agent-harness-design
description: Reviews any directive written for an AI agent, such as a skill, a pipeline step, a single review line, a system prompt, or a subagent brief, against current best practices for agent harness design so the agent performs its specific task as well as possible. Use when authoring or revising skills, prompts, or agent instructions.
---

DIRECTIVE is the text under review. AGENT is the model that will execute it.

DIRECTIVE is correct when AGENT, given only DIRECTIVE and its runtime context, reliably produces the intended outcome, and nothing in DIRECTIVE could be removed without degrading that.

Last reviewed against Sources: 2026-09-04. If today falls in a later calendar quarter, or the model-specific guide you read names a newer frontier model than Sources does, say so before starting and offer an update. An update reads every source, confirms each still resolves, drops any independent source that the current model-specific guides contradict or that no check still rests on, searches for newer guidance from OpenAI and Anthropic and for newer independent research, and keeps the list minimal and evergreen. It then applies this skill to itself against the refreshed Sources and sets the date.

1. State the outcome. Write down what AGENT must produce or achieve, who consumes it, what a maximally effective execution looks like, and where AGENT should stop for a human, if anywhere. If DIRECTIVE does not make these unmistakable, that is the first defect.

2. Establish AGENT's runtime context. List what AGENT will actually have when DIRECTIVE runs: inputs, tools, repository instructions, prior conversation, and the decisions already made upstream. Anything DIRECTIVE relies on that is not in that context does not exist to AGENT, and a decision AGENT cannot see is one it will remake differently.

3. Calibrate content in both directions.
    - For each clause, ask whether removing it would degrade the outcome. If not, cut it. Every clause competes for attention, including ones AGENT would satisfy anyway, and irrelevant material measurably degrades performance.
    - For each norm, policy, default, definition, or reason AGENT cannot infer from its context, add it. A directive is not complete because it is short. AGENT is a capable new colleague who knows the field but not your norms.
    - Where the form of the output or a judgment call is hard to state, one or two representative examples do more than further rules. Vary them so AGENT does not copy an accidental pattern.
    - Say what AGENT should do when the task cannot be completed or does not apply, so it reports rather than fabricates.

4. Calibrate freedom.
    - Where many approaches succeed, state the outcome and leave the method to AGENT. Where a step is fragile and only one sequence is safe, prescribe it exactly. Prescribing process on an open task anchors AGENT to the letter instead of the goal; leaving a fragile step open invites failure.
    - Calibrate to AGENT's capability as well. Frontier and reasoning-class models do better with goals and constraints; smaller models need more explicit steps.
    - A rule that must hold every time belongs in a mechanism such as a hook, lint rule, schema, or CI check, not in prose. DIRECTIVE carries judgment; the harness carries enforcement.

5. Check the wording for literal execution by AGENT.
    - One term per concept, used consistently, and any term AGENT could read two ways is defined.
    - No two clauses conflict, within DIRECTIVE or between DIRECTIVE and the instructions it runs inside. Current models follow instructions literally and spend effort reconciling contradictions instead of doing the task.
    - Where DIRECTIVE runs inside other instructions, it says which governs when they differ.
    - Prefer stating what to do. Use a prohibition only where no positive instruction expresses it.
    - Emphasis, "always", "if in doubt", and repetition cause over-triggering. A single unequivocal sentence usually steers.
    - A brief statement of the behavior beats an enumeration of cases. Lists of options dilute; give the default and the exception.
    - Put what matters most first, and also last when DIRECTIVE is long. Models attend least to the middle.
    - Every rule that governs a step is referenced from that step. A rule reachable only by inference is not there.
    - A colleague with no other context would follow it the same way AGENT will.
    - Read the model-specific guide under Sources for the exact model AGENT runs on. A directive tuned for one generation is often too prescriptive or too loose for the next.

6. If DIRECTIVE directs a review or evaluation, also check:
    - It defines what counts as a finding.
    - It states the policy default AGENT would otherwise be lenient about. Reviewers drift toward accepting what is in front of them.
    - It asks for every finding with evidence and leaves filtering to a separate adjudication, rather than asking one pass to both find and filter.

7. Test. Give DIRECTIVE to a fresh AGENT on a representative task, on each frontier model named under Model-specific at max reasoning effort, and compare its behavior to the outcome from step 1. Where you have no subagent for a model, run it through its vendor's command line, such as `codex exec` or `claude -p`, setting model and effort explicitly. Where a frontier model is unavailable, use that vendor's next most capable model and report which model ran. Revise from observed failures, not anticipated ones; where a test on the current model contradicts a source, the test governs. Repeat until behavior matches. Keep DIRECTIVE in version control so each change and the failure it fixed are recorded.

Report each clause kept, cut, or changed with its reason, the revised DIRECTIVE, and what remains unverified until tested.

# Sources

Model-specific entries cover each vendor's frontier model, the most capable it offers, and change only when that model changes; model-generic entries rarely.

## Model-specific

- OpenAI, Latest model prompting guide. The URL is evergreen; it carried GPT-6 Astra at last review: https://developers.openai.com/api/docs/guides/latest-model
- Anthropic, Prompting Claude Fable 5.1. Anthropic names each model's page, so this entry is replaced when a newer frontier model ships: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1

## Model-generic

OpenAI

- Prompt engineering guide: https://developers.openai.com/api/docs/guides/prompt-engineering
- Harness engineering: https://openai.com/index/harness-engineering/

Anthropic

- Prompting best practices: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Skill authoring best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Others

- Cognition, Don't build multi-agents, 2025; step 2, a decision AGENT cannot see is remade: https://cognition.com/blog/dont-build-multi-agents
- Hamel Husain, Your AI product needs evals, 2024; step 7, revise from observed failures: https://hamel.dev/blog/posts/evals/
- G-Research, LLM patterns for code review, 2026; step 6, separate finding from filtering: https://www.gresearch.com/news/building-a-code-review-tool-the-llm-patterns-that-actually-work/
- Liu et al., Lost in the Middle, 2023, measured on GPT-3.5 and Claude 1.3; step 5, first and last placement: https://arxiv.org/abs/2307.03172
- On the Paradoxical Interference between Instruction-Following and Task Solving, 2026, measured on Claude Sonnet 4.5 among others; step 3, even self-evident constraints cost performance: https://arxiv.org/abs/2601.22047
- Judging the Judges, 2024, measured on GPT-4 era judges; step 6, the leniency default: https://arxiv.org/abs/2406.12624
