import type { Linter } from 'eslint';

export const CODE_QUALITY_RULES: Linter.RulesRecord = {
    complexity: ['error', { max: 10 }],
    eqeqeq: ['error', 'always'],
    'max-statements': ['error', { max: 15 }],
    'no-param-reassign': ['error', { props: true }],
    'prefer-arrow-callback': [
        'error',
        {
            allowNamedFunctions: false,
            allowUnboundThis: true,
        },
    ],
    'prefer-const': [
        'error',
        {
            destructuring: 'any',
            ignoreReadBeforeAssign: false,
        },
    ],
    'sonarjs/cognitive-complexity': ['error', 10],
};
