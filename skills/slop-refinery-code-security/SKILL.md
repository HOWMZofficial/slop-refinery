---
name: slop-refinery-code-security
description: Deeply analyze code and report findings to aid in ensuring a low practical probability of security vulnerabilities.
---

`SOURCE_CODE` is the directory or file path under review.
`.slop-refinery/security_review_[enter current timestamp with the date and the exact time]` will be known in this file as `SECURITY_REVIEW_FILE_PATH`.
`.slop-refinery/security_hierarchy_[enter current timestamp with the date and the exact time].md` will be known in this file as `SECURITY_HIERARCHY_FILE_PATH`.
`SECURITY_HIERARCHY_RIGOR` defaults to `file` (can be overridden to `directory`, `function`, or `statement`).
`npx tsx <path-to-slop-refinery-code-security-skill>/scripts/generate-code-hierarchy.ts --source "<SOURCE_CODE>" --rigor "<SECURITY_HIERARCHY_RIGOR>" --output "<SECURITY_HIERARCHY_FILE_PATH>"` will be known in this file as `SECURITY_HIERARCHY_GENERATION_COMMAND`.

1. Create a markdown file at SECURITY_REVIEW_FILE_PATH
2. Run SECURITY_HIERARCHY_GENERATION_COMMAND to generate SECURITY_HIERARCHY_FILE_PATH
3. For each of the security risks listed below, inside of SECURITY_REVIEW_FILE_PATH:
    1. Create an empty checkbox for the security risk
    2. Create indented child checkboxes for the following:
        1. Read in the official web page for the risk e.g. `https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/` or `https://cwe.mitre.org/data/definitions/79.html`
        2. Deeply study the official web page for the risk to gain an excellent understanding of the risk
        3. Deeply analyze the code for any sign of the security risk. Use the checkboxes below to track your work and thoroughly analyze each portion of the code under review
        4. Hierarchy and code structure
            1. Copy the full hierarchy from SECURITY_HIERARCHY_FILE_PATH
            2. The hierarchy copied above should become children of the "Hierarchy and code structure" checkbox
4. Remember that each security risk needs its own indented "Hierarchy and code structure" checkbox, and that the hierarchy needs to be represented as child checkboxes to that checkbox. The hierarchy will be copied verbatim across all of the security risks in this manner
5. Execute SECURITY_REVIEW_FILE_PATH and check off every box after accomplishment
6. List any findings with empty checkboxes in a section of SECURITY_REVIEW_FILE_PATH called `# Findings`
7. Do not attempt to fix any findings, you are only reporting findings

# Security Risks

## OWASP Top 10: 2025

1. A01:2025 - Broken Access Control
2. A02:2025 - Security Misconfiguration
3. A03:2025 - Software Supply Chain Failures
4. A04:2025 - Cryptographic Failures
5. A05:2025 - Injection
6. A06:2025 - Insecure Design
7. A07:2025 - Authentication Failures
8. A08:2025 - Software or Data Integrity Failures
9. A09:2025 - Security Logging and Alerting Failures
10. A10:2025 - Mishandling of Exceptional Conditions

## CWE Top 25: 2025

1. CWE-79 - Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)
2. CWE-89 - Improper Neutralization of Special Elements used in an SQL Command (SQL Injection)
3. CWE-352 - Cross-Site Request Forgery (CSRF)
4. CWE-862 - Missing Authorization
5. CWE-787 - Out-of-bounds Write
6. CWE-22 - Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)
7. CWE-416 - Use After Free
8. CWE-125 - Out-of-bounds Read
9. CWE-78 - Improper Neutralization of Special Elements used in an OS Command (OS Command Injection)
10. CWE-94 - Improper Control of Generation of Code (Code Injection)
11. CWE-120 - Buffer Copy without Checking Size of Input (Classic Buffer Overflow)
12. CWE-434 - Unrestricted Upload of File with Dangerous Type
13. CWE-476 - NULL Pointer Dereference
14. CWE-121 - Stack-based Buffer Overflow
15. CWE-502 - Deserialization of Untrusted Data
16. CWE-122 - Heap-based Buffer Overflow
17. CWE-863 - Incorrect Authorization
18. CWE-20 - Improper Input Validation
19. CWE-284 - Improper Access Control
20. CWE-200 - Exposure of Sensitive Information to an Unauthorized Actor
21. CWE-306 - Missing Authentication for Critical Function
22. CWE-918 - Server-Side Request Forgery (SSRF)
23. CWE-77 - Improper Neutralization of Special Elements used in a Command (Command Injection)
24. CWE-639 - Authorization Bypass Through User-Controlled Key
25. CWE-770 - Allocation of Resources Without Limits or Throttling
