import { recommendedConfig } from '../src/index.ts';
import slopRefineryRepo from './custom-rules/index.ts';

const config = [
    ...recommendedConfig,
    {
        plugins: {
            'slop-refinery-repo': slopRefineryRepo,
        },
    },
    {
        files: [
            'skills/slop-refinery-code-security/scripts/generate-code-hierarchy.ts',
        ],
        rules: {
            'slop-refinery-repo/require-identical-files': [
                'error',
                {
                    counterpartFile:
                        '../../slop-refinery-code-simplicity/scripts/generate-code-hierarchy.ts',
                    normalizePatterns: [
                        {
                            pattern:
                                '<path-to-slop-refinery-code-security-skill>',
                            replacement: '<path-to-slop-refinery-skill>',
                        },
                        {
                            pattern:
                                '<path-to-slop-refinery-code-simplicity-skill>',
                            replacement: '<path-to-slop-refinery-skill>',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: [
            'skills/slop-refinery-code-simplicity/scripts/generate-code-hierarchy.ts',
        ],
        rules: {
            'slop-refinery-repo/require-identical-files': [
                'error',
                {
                    counterpartFile:
                        '../../slop-refinery-code-security/scripts/generate-code-hierarchy.ts',
                    normalizePatterns: [
                        {
                            pattern:
                                '<path-to-slop-refinery-code-security-skill>',
                            replacement: '<path-to-slop-refinery-skill>',
                        },
                        {
                            pattern:
                                '<path-to-slop-refinery-code-simplicity-skill>',
                            replacement: '<path-to-slop-refinery-skill>',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: [
            'eslint/**/*.ts',
            'eslint.config.ts',
            'scripts/**/*.ts',
            'src/**/*.ts',
            'skills/**/*.ts',
            'tests/**/*.ts',
        ],
        rules: {
            'slop-refinery/function-order': 'off',
            'slop-refinery/init-at-bottom': 'off',
            'slop-refinery/no-default-export': 'off',
        },
    },
    {
        files: [
            'eslint/**/*.ts',
            'scripts/**/*.ts',
            'skills/**/*.ts',
            'src/rules/**/*.ts',
            'tests/test-harness.ts',
        ],
        rules: {
            '@typescript-eslint/consistent-type-assertions': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/strict-boolean-expressions': 'off',
            complexity: 'off',
            'func-style': 'off',
            'functional/no-let': 'off',
            'max-statements': 'off',
            'sonarjs/cognitive-complexity': 'off',
        },
    },
];

export default config;
