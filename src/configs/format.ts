import perfectionist from 'eslint-plugin-perfectionist';
import tseslint from 'typescript-eslint';

import { getClassMemberSortConfig } from '../class-groups.ts';

const SORT_OPTIONS = {
    ignoreCase: true,
    order: 'asc',
    type: 'alphabetical',
} as const;

export const formatConfig = tseslint.config(
    {
        ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
        linterOptions: {
            reportUnusedDisableDirectives: false,
        },
    },
    {
        files: ['**/*.{cjs,cts,js,mjs,mts,ts,tsx}'],
        languageOptions: {
            parser: tseslint.parser,
        },
        plugins: {
            perfectionist,
        },
        rules: {
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
        },
    },
);
