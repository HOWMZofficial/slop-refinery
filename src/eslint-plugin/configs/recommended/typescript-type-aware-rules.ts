import type { Linter } from 'eslint';

export const TYPE_SCRIPT_TYPE_AWARE_RULES: Linter.RulesRecord = {
    '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
            assertionStyle: 'never',
        },
    ],
    '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
            allowConciseArrowFunctionExpressionsStartingWithVoid: false,
            allowDirectConstAssertionInArrowFunctions: true,
            allowedNames: [],
            allowExpressions: false,
            allowFunctionsWithoutTypeParameters: false,
            allowHigherOrderFunctions: true,
            allowIIFEs: false,
            allowTypedFunctionExpressions: true,
        },
    ],
    '@typescript-eslint/no-explicit-any': [
        'error',
        {
            fixToUnknown: false,
            ignoreRestArgs: false,
        },
    ],
    '@typescript-eslint/no-inferrable-types': [
        'error',
        {
            ignoreParameters: true,
            ignoreProperties: true,
        },
    ],
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    'slop-refinery/types-at-top': 'error',
};
