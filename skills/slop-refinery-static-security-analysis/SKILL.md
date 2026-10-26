---
name: slop-refinery-static-security-analysis
description: Resolve static security findings and recheck existing suppressions or dismissals when code changes affect their justification.
---

Analyze each finding individually against the actual code, callers, inputs, and existing protections. Use [slop-refinery-human-judgment](../slop-refinery-human-judgment/SKILL.md) for each finding and proposed response, including suppressions and dismissals; these are not inherently human decisions.

When changing or reviewing code, recheck suppressions and dismissals affected by changes to inputs, callers, or protections, even if the suppressed line is unchanged. Keep an exception only while its explanation is supported by the current code; update an outdated explanation or remove the suppression or reopen the alert and handle the finding below. A passing scan does not validate a suppressed finding.

- Valid: Fix the underlying issue within the agreed requirements.
- False positive: Give a concise explanation of why the reported vulnerability does not apply. Dismiss the CodeQL alert as a false positive with that explanation. For ESLint, add an inline suppression naming only the affected rule and carrying that explanation; scope it to the reviewed line. For other analyzers, use a finding-specific suppression with the same explanation.
- Unresolved: Investigate further. If required evidence is unavailable, report the blocker and leave the finding open. Uncertainty or accepting a real risk does not make a finding a false positive.

Carry out responses that require no human decision without asking again. Honor the user's scope limits and settled decisions; follow the calling workflow for unresolved human decisions, blockers, and publication. Keep security rules enabled when suppressing individual findings.

Rerun the relevant checks and report what was fixed, suppressed, dismissed, or remains unresolved.
