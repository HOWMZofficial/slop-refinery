import { typesAtTopRule } from '../src/rules/types-at-top.ts';
import { createTypeScriptRuleTester, repoPath } from './test-harness.ts';

const ruleTester = createTypeScriptRuleTester();

ruleTester.run('types-at-top', typesAtTopRule, {
    invalid: [
        {
            code: 'const value = 1;\ntype Value = string;',
            errors: [{ messageId: 'typeAfterCode' }],
            filename: repoPath('tests', 'fixtures', 'types-at-top-0.ts'),
        },
        {
            code: 'function read(): number { return 1; }\ninterface Value { id: string; }',
            errors: [{ messageId: 'typeAfterCode' }],
            filename: repoPath('tests', 'fixtures', 'types-at-top-1.ts'),
        },
        {
            code: 'export const value = 1;\nexport type Value = string;',
            errors: [{ messageId: 'typeAfterCode' }],
            filename: repoPath('tests', 'fixtures', 'types-at-top-2.ts'),
        },
        {
            code: 'const value = 1;\nexport type { Value };',
            errors: [{ messageId: 'typeAfterCode' }],
            filename: repoPath('tests', 'fixtures', 'types-at-top-3.ts'),
        },
        {
            code: 'const value = 1;\ntype Value = string;\ninterface OtherValue {}',
            errors: [
                { messageId: 'typeAfterCode' },
                { messageId: 'typeAfterCode' },
            ],
            filename: repoPath('tests', 'fixtures', 'types-at-top-4.ts'),
        },
    ],
    valid: [
        {
            code: 'type Value = string;\nconst value: Value = "x";',
            filename: repoPath('tests', 'fixtures', 'types-at-top-valid-0.ts'),
        },
        {
            code: 'interface Value { id: string; }\nfunction read(): Value { return { id: "1" }; }',
            filename: repoPath('tests', 'fixtures', 'types-at-top-valid-1.ts'),
        },
        {
            code: 'export type Value = string;\nexport const value: Value = "x";',
            filename: repoPath('tests', 'fixtures', 'types-at-top-valid-2.ts'),
        },
        {
            code: 'namespace Value { export type Name = string; }\nconst value = 1;',
            filename: repoPath('tests', 'fixtures', 'types-at-top-valid-3.ts'),
        },
        {
            code: "import './side-effect.ts';\ninterface Value { id: string; }\nconst value: Value = { id: '1' };",
            filename: repoPath('tests', 'fixtures', 'types-at-top-valid-4.ts'),
        },
    ],
});
