---
name: slop-refinery-backward-compatibility
description: Reviews implementations for obsolete compatibility behavior. Use when reviewing backward compatibility or clean cutovers.
---

UNDER_REVIEW is the implementation. REQUIREMENTS are its agreed requirements.

Report findings and suggested fixes only. Do not apply fixes, edit repository files, change Git state, or update the PR.

Find all code in or affected by UNDER_REVIEW, introduced or pre-existing, that preserves, tolerates, or asserts the absence of anything obsolete. Cutovers are clean by default, so every instance is a finding unless REQUIREMENTS explicitly require it.
