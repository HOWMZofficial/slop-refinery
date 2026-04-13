import type { Linter } from 'eslint';

type SortOptions = {
    ignoreCase: boolean;
    order: 'asc' | 'desc';
    type: 'alphabetical';
};

export function createSortingRules(
    sortOptions: SortOptions,
): Linter.RulesRecord {
    return {
        'perfectionist/sort-array-includes': ['error', sortOptions],
        'perfectionist/sort-classes': 'error',
        'perfectionist/sort-enums': ['error', sortOptions],
        'perfectionist/sort-exports': ['error', sortOptions],
        'perfectionist/sort-imports': ['error', sortOptions],
        'perfectionist/sort-interfaces': ['error', sortOptions],
        'perfectionist/sort-intersection-types': ['error', sortOptions],
        'perfectionist/sort-maps': ['error', sortOptions],
        'perfectionist/sort-named-exports': ['error', sortOptions],
        'perfectionist/sort-named-imports': ['error', sortOptions],
        'perfectionist/sort-object-types': ['error', sortOptions],
        'perfectionist/sort-objects': ['error', sortOptions],
        'perfectionist/sort-sets': ['error', sortOptions],
        'perfectionist/sort-switch-case': ['error', sortOptions],
        'perfectionist/sort-union-types': ['error', sortOptions],
    };
}
