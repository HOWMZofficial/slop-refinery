import perfectionist from 'eslint-plugin-perfectionist';
import tseslint from 'typescript-eslint';

import { SORTING_RULES, SOURCE_FILES } from './recommended.ts';

export const formatConfig = tseslint.config(
    {
        linterOptions: {
            reportUnusedDisableDirectives: false,
        },
    },
    {
        files: SOURCE_FILES,
        languageOptions: {
            parser: tseslint.parser,
        },
        plugins: {
            perfectionist,
        },
        rules: SORTING_RULES,
    },
);
