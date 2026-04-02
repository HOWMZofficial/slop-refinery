import { pathCaseRule } from '../src/rules/path-case.ts';
import { createTypeScriptRuleTester, repoPath } from './test-harness.ts';

const ruleTester = createTypeScriptRuleTester();

ruleTester.run('path-case', pathCaseRule, {
    invalid: [
        {
            code: 'export const value = 1;',
            errors: [{ messageId: 'invalidDirectoryName' }],
            filename: repoPath('src', 'app_shell', 'router.ts'),
        },
        {
            code: 'export const value = 1;',
            errors: [{ messageId: 'invalidFileName' }],
            filename: repoPath('scripts', 'write_supabase_env.ts'),
        },
        {
            code: 'export const value = 1;',
            errors: [{ messageId: 'invalidFileName' }],
            filename: repoPath(
                'src',
                'frontend',
                'app-shell',
                'router_file.tsx',
            ),
        },
        {
            code: 'export const value = 1;',
            errors: [{ messageId: 'invalidDirectoryName' }],
            filename: repoPath(
                'test',
                'config_files',
                'vitest-fast-check.setup.ts',
            ),
        },
    ],
    valid: [
        {
            code: 'export const value = 1;',
            filename: repoPath('src', 'frontend', 'app-shell', 'router.ts'),
        },
        {
            code: 'export const value = 1;',
            filename: repoPath('src', 'frontend', '.temp', 'cache-file.ts'),
        },
        {
            code: 'export const value = 1;',
            filename: repoPath('scripts', 'write-supabase-env.ts'),
        },
        {
            code: 'export const value = 1;',
            filename: repoPath(
                'tests',
                'fixtures',
                'path-case-valid-file.test.ts',
            ),
        },
    ],
});
