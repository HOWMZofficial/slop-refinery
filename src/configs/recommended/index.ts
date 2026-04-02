import js from '@eslint/js';
import checkFile from 'eslint-plugin-check-file';
import functional from 'eslint-plugin-functional';
import importPlugin from 'eslint-plugin-import';
import perfectionist from 'eslint-plugin-perfectionist';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

import { slopRefinery } from '../../plugin.ts';
import { CODE_QUALITY_RULES } from './code-quality-rules.ts';
import { createFileNamingRules } from './file-naming-rules.ts';
import { FUNCTION_STYLE_RULES } from './function-style-rules.ts';
import { IMPORT_GRAPH_RULES } from './import-graph-rules.ts';
import { SLOP_REFINERY_RULES } from './slop-refinery-rules.ts';
import { createSortingRules } from './sorting-rules.ts';
import { TYPE_SCRIPT_BASELINE_RULES } from './typescript-baseline-rules.ts';
import { TYPE_SCRIPT_TYPE_AWARE_RULES } from './typescript-type-aware-rules.ts';

export const SOURCE_EXTENSIONS = [
    '.cjs',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.mts',
    '.ts',
    '.tsx',
] as const;

const SOURCE_EXTENSION_NAMES = SOURCE_EXTENSIONS.map((extension) => {
    return extension.slice(1);
});

export const SOURCE_FILE_PATTERN = `**/*.{${SOURCE_EXTENSION_NAMES.join(',')}}`;

export const SOURCE_FILES = [SOURCE_FILE_PATTERN];

export const SORT_OPTIONS = {
    ignoreCase: true,
    order: 'asc',
    type: 'alphabetical',
} as const;

export const SORTING_RULES = createSortingRules(SORT_OPTIONS);

const FILE_NAMING_RULES = createFileNamingRules(SOURCE_FILE_PATTERN);

const IMPORT_SETTINGS = {
    'import/extensions': [...SOURCE_EXTENSIONS],
    'import/parsers': {
        '@typescript-eslint/parser': [...SOURCE_EXTENSIONS],
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
            'check-file': checkFile,
            functional,
            import: importPlugin,
            perfectionist,
            'slop-refinery': slopRefinery,
            sonarjs,
        },
        rules: {
            ...CODE_QUALITY_RULES,
            ...FILE_NAMING_RULES,
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
