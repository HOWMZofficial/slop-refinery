import js from '@eslint/js';
import perfectionist from 'eslint-plugin-perfectionist';
import tseslint from 'typescript-eslint';

import { slopRefinery } from '../plugin.ts';

const SOURCE_FILES = ['**/*.{cjs,cts,js,mjs,mts,ts,tsx}'];
const SOURCE_IGNORES = [
    '**/*.config.{cjs,cts,js,mjs,mts,ts}',
    '**/*.{spec,test}.{cjs,cts,js,mjs,mts,ts,tsx}',
    '**/__tests__/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/test/**',
    '**/tests/**',
];
const SORT_OPTIONS = {
    ignoreCase: true,
    order: 'asc',
    type: 'alphabetical',
} as const;

export const recommendedConfig = tseslint.config(
    {
        ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: SOURCE_FILES,
        ignores: SOURCE_IGNORES,
        plugins: {
            perfectionist,
            'slop-refinery': slopRefinery,
        },
        rules: {
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    varsIgnorePattern: '^_',
                },
            ],
            eqeqeq: ['error', 'always'],
            'perfectionist/sort-exports': ['error', SORT_OPTIONS],
            'perfectionist/sort-imports': ['error', SORT_OPTIONS],
            'perfectionist/sort-named-exports': ['error', SORT_OPTIONS],
            'perfectionist/sort-named-imports': ['error', SORT_OPTIONS],
            'perfectionist/sort-object-types': ['error', SORT_OPTIONS],
            'perfectionist/sort-union-types': ['error', SORT_OPTIONS],
            'prefer-const': 'error',
            'slop-refinery/function-order': 'error',
            'slop-refinery/init-at-bottom': 'error',
            'slop-refinery/no-default-export': 'error',
            'slop-refinery/react-component-name': 'error',
            'slop-refinery/types-at-top': 'error',
        },
    },
);
