import { noDefaultExportRule } from '../src/eslint-plugin/rules/no-default-export.ts';
import { createTypeScriptRuleTester, repoPath } from './test-harness.ts';

const ruleTester = createTypeScriptRuleTester();

ruleTester.run('no-default-export', noDefaultExportRule, {
    invalid: [
        {
            code: 'export default foo;',
            errors: [{ messageId: 'noDefaultExport' }],
            filename: repoPath('tests', 'fixtures', 'no-default-export-0.ts'),
        },
        {
            code: 'export default 1;',
            errors: [{ messageId: 'noDefaultExport' }],
            filename: repoPath('tests', 'fixtures', 'no-default-export-1.ts'),
        },
        {
            code: "export default 'x';",
            errors: [{ messageId: 'noDefaultExport' }],
            filename: repoPath('tests', 'fixtures', 'no-default-export-2.ts'),
        },
        {
            code: 'export default function read(): number { return 1; }',
            errors: [{ messageId: 'noDefaultExport' }],
            filename: repoPath('tests', 'fixtures', 'no-default-export-3.ts'),
        },
        {
            code: 'export default class Example {}',
            errors: [{ messageId: 'noDefaultExport' }],
            filename: repoPath('tests', 'fixtures', 'no-default-export-4.ts'),
        },
    ],
    valid: [
        {
            code: 'export const foo = 1;',
            filename: repoPath(
                'tests',
                'fixtures',
                'no-default-export-valid-0.ts',
            ),
        },
        {
            code: 'export function foo(): number { return 1; }',
            filename: repoPath(
                'tests',
                'fixtures',
                'no-default-export-valid-1.ts',
            ),
        },
        {
            code: 'const foo = 1; export { foo };',
            filename: repoPath(
                'tests',
                'fixtures',
                'no-default-export-valid-2.ts',
            ),
        },
        {
            code: 'export type Foo = { value: number };',
            filename: repoPath(
                'tests',
                'fixtures',
                'no-default-export-valid-3.ts',
            ),
        },
        {
            code: "export { foo } from './foo.ts';",
            filename: repoPath(
                'tests',
                'fixtures',
                'no-default-export-valid-4.ts',
            ),
        },
    ],
});
