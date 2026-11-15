---
name: slop-refinery-quick-review
description: Streamlined subset of the AI Review section from the slop-refinery-pipeline skill.
---

Perform steps 10, 11, 12, and 13 from the `slop-refinery-pipeline` skill. Modify each step as follows:

- Step 10: Remove the requirement to perform the reviews using fresh, independent subagents. Reviews should be performed by one agent.
- Step 10.2: Skip this step
- Step 10.3: Skip this step
- Step 10.13: Skip this step
- Step 13: If a PR already exists for the implementation under review, then follow step 13 as written. If a PR does not yet exist for the implementation under review, then simply print the `# Findings requiring human judgment` text that you've created in your response.
