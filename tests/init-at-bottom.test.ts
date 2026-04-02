import { initAtBottomRule } from '../src/rules/init-at-bottom.ts';
import { createTypeScriptRuleTester, repoPath } from './test-harness.ts';

const ruleTester = createTypeScriptRuleTester();

ruleTester.run('init-at-bottom', initAtBottomRule, {
    invalid: [
        {
            code: 'function helper() {}\nfunction main() {}\nmain();',
            errors: [{ messageId: 'initFunctionFirst' }],
            filename: repoPath('tests', 'fixtures', 'init-at-bottom-0.ts'),
        },
        {
            code: 'function main() {}',
            errors: [{ messageId: 'initCallMissing' }],
            filename: repoPath('tests', 'fixtures', 'init-at-bottom-1.ts'),
        },
        {
            code: 'function main() {}\nmain();\nconst trailingValue = 1;',
            errors: [{ messageId: 'initCallLast' }],
            filename: repoPath('tests', 'fixtures', 'init-at-bottom-2.ts'),
        },
        {
            code: 'function main() {}\nother();\nmain();',
            errors: [{ messageId: 'executableStatement' }],
            filename: repoPath('tests', 'fixtures', 'init-at-bottom-3.ts'),
        },
        {
            code: 'main();',
            errors: [{ messageId: 'initFunctionMissing' }],
            filename: repoPath('tests', 'fixtures', 'init-at-bottom-4.ts'),
        },
        {
            code: 'function main() {}\nfunction init() {}\nmain();',
            errors: [
                { messageId: 'multipleInitFunctions' },
                { messageId: 'multipleInitFunctions' },
            ],
            filename: repoPath('tests', 'fixtures', 'init-at-bottom-5.ts'),
        },
    ],
    valid: [
        {
            code: 'function main() {}\nmain();',
            filename: repoPath(
                'tests',
                'fixtures',
                'init-at-bottom-valid-0.ts',
            ),
        },
        {
            code: 'export function init() {}\ninit();',
            filename: repoPath(
                'tests',
                'fixtures',
                'init-at-bottom-valid-1.ts',
            ),
        },
        {
            code: 'function main() { helper(); }\nfunction helper() {}\nmain();',
            filename: repoPath(
                'tests',
                'fixtures',
                'init-at-bottom-valid-2.ts',
            ),
        },
        {
            code: 'async function main() {}\nawait main();',
            filename: repoPath(
                'tests',
                'fixtures',
                'init-at-bottom-valid-3.ts',
            ),
        },
    ],
});
