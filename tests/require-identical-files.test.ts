import { requireIdenticalFilesRule } from '../eslint/custom-rules/require-identical-files.ts';
import { createTypeScriptRuleTester, repoPath } from './test-harness.ts';

const ruleTester = createTypeScriptRuleTester();

ruleTester.run('require-identical-files', requireIdenticalFilesRule, {
    invalid: [
        {
            code: 'export const value = 1;\n',
            errors: [{ messageId: 'differentContents' }],
            filename: repoPath(
                'tests',
                'fixtures',
                'require-identical-files-source-invalid.ts',
            ),
            options: [
                { counterpartFile: './require-identical-files-different.ts' },
            ],
        },
    ],
    valid: [
        {
            code: 'export const value = 1;\n',
            filename: repoPath(
                'tests',
                'fixtures',
                'require-identical-files-source-valid.ts',
            ),
            options: [{ counterpartFile: './require-identical-files-same.ts' }],
        },
        {
            code: [
                'export const skillPath =',
                "    '<path-to-slop-refinery-code-security-skill>/scripts/generate-code-hierarchy.ts';",
                '',
            ].join('\n'),
            filename: repoPath(
                'tests',
                'fixtures',
                'require-identical-files-normalized-source.ts',
            ),
            options: [
                {
                    counterpartFile:
                        './require-identical-files-normalized-counterpart.ts',
                    normalizePatterns: [
                        {
                            pattern:
                                '<path-to-slop-refinery-code-security-skill>',
                            replacement: '<path-to-slop-refinery-skill>',
                        },
                        {
                            pattern:
                                '<path-to-slop-refinery-code-simplicity-skill>',
                            replacement: '<path-to-slop-refinery-skill>',
                        },
                    ],
                },
            ],
        },
    ],
});
