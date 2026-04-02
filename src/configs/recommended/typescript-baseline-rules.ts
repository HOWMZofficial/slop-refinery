import type { Linter } from 'eslint';

export const TYPE_SCRIPT_BASELINE_RULES: Linter.RulesRecord = {
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    '@typescript-eslint/no-unused-vars': [
        'error',
        {
            args: 'after-used',
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            ignoreClassWithStaticInitBlock: false,
            ignoreRestSiblings: false,
            reportUsedIgnorePattern: false,
            vars: 'all',
            varsIgnorePattern: '^_',
        },
    ],
};
