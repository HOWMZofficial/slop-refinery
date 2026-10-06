---
name: slop-refinery-final-checks
description: Run final checks on a PR.
---

Complete each of the following steps against the intended PR:

1. Latest main and intended diff: Update the branch with the latest `origin/main` and verify that it is not behind. Review the complete diff against `origin/main` and verify that it contains only intended changes.
2. Intended behavior: Read the intended behavior the PR records, in its description and any linked issue. List every explicit requirement and verify that each one is fully implemented.
3. Supabase preview: The preview applies only migrations it has not yet applied, so it is stale whenever a migration it already ran was later changed or removed on the branch. Verify that the preview for the final commit reflects the branch's current migrations. If it is stale, close the PR, wait at least 30 seconds, and confirm Supabase has deleted the old preview before reopening the PR once to recreate it. Netlify does not rebuild on reopen: retry the Netlify deploy or push a commit, wait for the build to finish, then verify that it uses the recreated Supabase preview. If it is still stale, that is a blocker.
4. Migration safety: If the branch adds migrations, verify that each one sorts after the newest migration on `origin/main`, all migrations replay cleanly, and no migration destroys or corrupts existing production data.
5. Read-only production Supabase MCP: When the Supabase MCP is available for the production database, use only read-only queries to validate the affected database schema, data, policies, and migration assumptions on the production database.
6. All local and CI/CD checks: Run every required local check including `npm test`, and wait for every CI/CD check that applies to the PR to pass on the final commit. Handle static security findings with [slop-refinery-static-security-analysis](../slop-refinery-static-security-analysis/SKILL.md). If anything fails, fix it, push the fix, and repeat every local and CI/CD check.
