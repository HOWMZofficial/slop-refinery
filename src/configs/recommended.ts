import type { Linter } from 'eslint';

import js from '@eslint/js';
import functional from 'eslint-plugin-functional';
import importPlugin from 'eslint-plugin-import';
import perfectionist from 'eslint-plugin-perfectionist';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

import { slopRefinery } from '../plugin.ts';

export const SOURCE_FILES = ['**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}'];
export const SORT_OPTIONS = {
    ignoreCase: true,
    order: 'asc',
    type: 'alphabetical',
} as const;
const CODE_QUALITY_RULES: Linter.RulesRecord = {
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
    'prefer-const': 'error',
    'sonarjs/cognitive-complexity': ['error', 10],
};
const FUNCTION_STYLE_RULES: Linter.RulesRecord = {
    'func-style': ['error', 'declaration', { allowArrowFunctions: false }],
    'functional/no-let': [
        'error',
        {
            allowInForLoopInit: true,
            ignoreIdentifierPattern: '^[mM]utable',
        },
    ],
};
export const SORTING_RULES: Linter.RulesRecord = {
    'perfectionist/sort-array-includes': ['error', SORT_OPTIONS],
    'perfectionist/sort-classes': 'error',
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
};
const SLOP_REFINERY_RULES: Linter.RulesRecord = {
    'slop-refinery/function-order': 'error',
    'slop-refinery/init-at-bottom': 'error',
    'slop-refinery/no-default-export': 'error',
    'slop-refinery/path-case': 'error',
};
const TYPE_SCRIPT_BASELINE_RULES: Linter.RulesRecord = {
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    '@typescript-eslint/no-unused-vars': [
        'error',
        {
            args: 'after-used',
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            varsIgnorePattern: '^_',
        },
    ],
};
const TYPE_SCRIPT_TYPE_AWARE_RULES: Linter.RulesRecord = {
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
const IMPORT_GRAPH_RULES: Linter.RulesRecord = {
    'import/no-cycle': ['error', { ignoreExternal: true }],
    'import/no-self-import': 'error',
};
const IMPORT_SETTINGS = {
    'import/extensions': [
        '.cjs',
        '.cts',
        '.js',
        '.jsx',
        '.mjs',
        '.mts',
        '.ts',
        '.tsx',
    ],
    'import/parsers': {
        '@typescript-eslint/parser': [
            '.cjs',
            '.cts',
            '.js',
            '.jsx',
            '.mjs',
            '.mts',
            '.ts',
            '.tsx',
        ],
    },
    'import/resolver': {
        typescript: true,
    },
} as const;
const LANGUAGE_OPTIONS = {
    parser: tseslint.parser,
    parserOptions: {
        projectService: true,
    },
} as const;

export const recommendedConfig = tseslint.config(
    js.configs.recommended,
    tseslint.configs.eslintRecommended,
    ...tseslint.configs.recommended,
    {
        files: SOURCE_FILES,
        languageOptions: LANGUAGE_OPTIONS,
        plugins: {
            functional,
            import: importPlugin,
            perfectionist,
            'slop-refinery': slopRefinery,
            sonarjs,
        },
        rules: {
            ...CODE_QUALITY_RULES,
            ...FUNCTION_STYLE_RULES,
            ...IMPORT_GRAPH_RULES,
            ...SORTING_RULES,
            ...SLOP_REFINERY_RULES,
            ...TYPE_SCRIPT_BASELINE_RULES,
            ...TYPE_SCRIPT_TYPE_AWARE_RULES,
        },
        settings: IMPORT_SETTINGS,
    },
);
