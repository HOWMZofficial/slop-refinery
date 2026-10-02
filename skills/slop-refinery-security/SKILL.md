---
name: slop-refinery-security
description: Reviews implementations for unauthorized access, denial of service, and duplicate security controls. Use when reviewing implementation security.
---

UNDER_REVIEW is the implementation.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

The standard is correctness under attack: only authenticated users and callers reach UNDER_REVIEW, and each can read, change, or trigger only what they are authorized to. Find every way anyone could exceed that, or deny UNDER_REVIEW to others, and show the concrete path for each. Find also every control UNDER_REVIEW adds that duplicates one the codebase already enforces.
