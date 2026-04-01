---
name: slop-refinery-code-security
description: Review a Node.js, TypeScript, or JavaScript codebase for practical security risks and document the findings.
---

Use this skill when the task is security review, hardening analysis, or threat-oriented inspection. This skill reports findings; it does not fix them unless the task explicitly asks for fixes afterward.

## Inputs

- `SOURCE_CODE`: the directory or file path under review
- Optional `SECURITY_HIERARCHY_RIGOR`: `directory`, `file`, `function`, or `statement`

## Working Files

- `RUN_ID`: current UTC timestamp in `YYYYMMDDTHHMMSSZ`
- `RUN_DIR`: `.ai_scratchpad/code_security/<RUN_ID>/`
- `SECURITY_HIERARCHY_FILE_PATH`: `.ai_scratchpad/code_security/<RUN_ID>/code_structure.md`
- `SECURITY_REVIEW_FILE_PATH`: `.ai_scratchpad/code_security/<RUN_ID>/review.md`

## Hierarchy Command

Generate the hierarchy with the skill-local script:

```bash
npx tsx ./skills/slop-refinery-code-security/scripts/generate-code-hierarchy.ts --source "<SOURCE_CODE>" --rigor "<SECURITY_HIERARCHY_RIGOR>" --output "<SECURITY_HIERARCHY_FILE_PATH>"
```

If `SECURITY_HIERARCHY_RIGOR` is not provided, default to `file`.

## Review Scope

Use the current official OWASP Top 10 and CWE Top 25 as the backbone of the review. Focus on the risks that actually make sense for the code under review.

## Workflow

1. Create `RUN_DIR`.
2. Generate `SECURITY_HIERARCHY_FILE_PATH`.
3. Create `SECURITY_REVIEW_FILE_PATH`.
4. Review the code against the relevant OWASP and CWE risk categories.
5. Track the hierarchy in the review so coverage is explicit.
6. Record findings with concrete evidence:
    - affected file or code path
    - why it is risky
    - how it could realistically fail or be abused
    - what should be done next
7. Leave non-findings as checked review items so the review trail is clear.

## Guardrails

- Do not fix code as part of this skill unless the task explicitly asks for it.
- Prefer concrete attack paths over vague “could be insecure” statements.
- Distinguish true findings from missing context or open questions.
- Call out authorization, input validation, secrets handling, command execution, deserialization, filesystem access, SSRF, and dependency risks explicitly when relevant.

## Completion Criteria

- The review covers the relevant security categories.
- Findings are concrete, scoped, and actionable.
- The hierarchy shows what was actually inspected.
