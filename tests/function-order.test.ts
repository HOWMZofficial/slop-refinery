import { functionOrderRule } from '../src/eslint-plugin/rules/function-order.ts';
import { createTypeScriptRuleTester, repoPath } from './test-harness.ts';

const ruleTester = createTypeScriptRuleTester();

ruleTester.run('function-order', functionOrderRule, {
    invalid: [
        {
            code: 'function helper() {}\nfunction main() { helper(); }\nmain();',
            errors: [{ messageId: 'outOfOrder' }],
            filename: repoPath('tests', 'fixtures', 'function-order-0.ts'),
        },
        {
            code: 'function two() {}\nfunction one() { two(); }\nfunction main() { one(); }\nmain();',
            errors: [{ messageId: 'outOfOrder' }, { messageId: 'outOfOrder' }],
            filename: repoPath('tests', 'fixtures', 'function-order-1.ts'),
        },
        {
            code: 'function helper() {}\nexport function read() { helper(); }',
            errors: [{ messageId: 'outOfOrder' }],
            filename: repoPath('tests', 'fixtures', 'function-order-2.ts'),
        },
        {
            code: 'function c() {}\nfunction b() { c(); }\nexport function a() { b(); }',
            errors: [{ messageId: 'outOfOrder' }, { messageId: 'outOfOrder' }],
            filename: repoPath('tests', 'fixtures', 'function-order-3.ts'),
        },
    ],
    valid: [
        {
            code: 'function main() { helper(); }\nfunction helper() {}\nmain();',
            filename: repoPath(
                'tests',
                'fixtures',
                'function-order-valid-0.ts',
            ),
        },
        {
            code: 'export function read() { parse(); }\nfunction parse() {}',
            filename: repoPath(
                'tests',
                'fixtures',
                'function-order-valid-1.ts',
            ),
        },
        {
            code: 'function boot() { one(); two(); }\nfunction one() {}\nfunction two() {}\nboot();',
            filename: repoPath(
                'tests',
                'fixtures',
                'function-order-valid-2.ts',
            ),
        },
        {
            code: 'export function first() { a(); }\nexport function second() { b(); }\nfunction a() {}\nfunction b() {}',
            filename: repoPath(
                'tests',
                'fixtures',
                'function-order-valid-3.ts',
            ),
        },
        {
            code: 'function boot() {}\nfunction orphan() {}\nboot();',
            filename: repoPath(
                'tests',
                'fixtures',
                'function-order-valid-4.ts',
            ),
        },
    ],
});
