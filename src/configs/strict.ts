import js from '@eslint/js';
import functional from 'eslint-plugin-functional';
import importPlugin from 'eslint-plugin-import';
import perfectionist from 'eslint-plugin-perfectionist';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

import { getClassMemberSortConfig } from '../class-groups.ts';
import { slopRefinery } from '../plugin.ts';

const STRICT_SOURCE_FILES = ['**/*.{cts,mts,ts,tsx}'];
const STRICT_SOURCE_IGNORES = [
    '**/*.config.{cts,mts,ts}',
    '**/*.{spec,test}.{cts,mts,ts,tsx}',
    '**/__tests__/**',
    '**/coverage/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/test/**',
    '**/tests/**',
];
const SORT_OPTIONS = {
    ignoreCase: true,
    order: 'asc',
    type: 'alphabetical',
} as const;

export const strictConfig = tseslint.config(
    {
        ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
    },
    js.configs.recommended,
    tseslint.configs.eslintRecommended,
    ...tseslint.configs.recommended,
    {
        files: STRICT_SOURCE_FILES,
        ignores: STRICT_SOURCE_IGNORES,
        languageOptions: {
            parserOptions: {
                ecmaVersion: 'latest',
                projectService: true,
                sourceType: 'module',
            },
        },
        plugins: {
            functional,
            import: importPlugin,
            perfectionist,
            'slop-refinery': slopRefinery,
            sonarjs,
        },
        rules: {
            '@typescript-eslint/consistent-type-assertions': [
                'error',
                {
                    assertionStyle: 'never',
                },
            ],
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
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
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/strict-boolean-expressions': 'error',
            complexity: ['error', { max: 10 }],
            eqeqeq: ['error', 'always'],
            'func-style': [
                'error',
                'declaration',
                { allowArrowFunctions: false },
            ],
            'functional/no-let': [
                'error',
                {
                    allowInForLoopInit: true,
                    ignoreIdentifierPattern: '^[mM]utable',
                },
            ],
            'import/no-cycle': ['error', { ignoreExternal: true }],
            'import/no-self-import': 'error',
            'max-statements': ['error', { max: 15 }],
            'no-param-reassign': ['error', { props: true }],
            'perfectionist/sort-array-includes': ['error', SORT_OPTIONS],
            'perfectionist/sort-classes': ['error', getClassMemberSortConfig()],
            'perfectionist/sort-enums': ['error', SORT_OPTIONS],
            'perfectionist/sort-exports': ['error', SORT_OPTIONS],
            'perfectionist/sort-imports': ['error', SORT_OPTIONS],
            'perfectionist/sort-interfaces': ['error', SORT_OPTIONS],
            'perfectionist/sort-intersection-types': ['error', SORT_OPTIONS],
            'perfectionist/sort-maps': ['error', SORT_OPTIONS],
            'perfectionist/sort-named-exports': ['error', SORT_OPTIONS],
            'perfectionist/sort-named-imports': ['error', SORT_OPTIONS],
            'perfectionist/sort-object-types': ['error', SORT_OPTIONS],
            'perfectionist/sort-objects': ['error', SORT_OPTIONS],
            'perfectionist/sort-sets': ['error', SORT_OPTIONS],
            'perfectionist/sort-switch-case': ['error', SORT_OPTIONS],
            'perfectionist/sort-union-types': ['error', SORT_OPTIONS],
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
            'slop-refinery/function-order': 'error',
            'slop-refinery/init-at-bottom': 'error',
            'slop-refinery/no-default-export': 'error',
            'slop-refinery/react-component-name': 'error',
            'slop-refinery/types-at-top': 'error',
            'sonarjs/cognitive-complexity': ['error', 10],
        },
        settings: {
            'import/extensions': ['.ts', '.tsx'],
            'import/parsers': {
                '@typescript-eslint/parser': ['.ts', '.tsx'],
            },
            'import/resolver': {
                typescript: {
                    project: './tsconfig.json',
                },
            },
        },
    },
    {
        files: ['**/*.d.ts'],
        rules: {
            'no-var': 'off',
        },
    },
    {
        files: [
            '**/*.{spec,test}.{cts,mts,ts,tsx}',
            '**/__tests__/**/*.ts',
            'test/**/*.ts',
            'tests/**/*.ts',
        ],
        rules: {
            '@typescript-eslint/consistent-type-assertions': 'off',
            'functional/no-let': 'off',
            'slop-refinery/init-at-bottom': 'off',
        },
    },
    {
        files: ['src/rules/**/*.ts', 'tests/test-harness.ts'],
        rules: {
            '@typescript-eslint/consistent-type-assertions': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/strict-boolean-expressions': 'off',
            complexity: 'off',
            'func-style': 'off',
            'functional/no-let': 'off',
            'max-statements': 'off',
            'slop-refinery/function-order': 'off',
            'slop-refinery/init-at-bottom': 'off',
            'slop-refinery/no-default-export': 'off',
            'slop-refinery/types-at-top': 'off',
            'sonarjs/cognitive-complexity': 'off',
        },
    },
);
