import { recommendedConfig } from '../src/eslint-plugin/index.ts';

const config = [
    {
        ignores: [
            'dist/**',
            'skills/slop-refinery-setup/references/templates/**',
        ],
    },
    ...recommendedConfig,
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
            'src/cli/**/*.ts',
            'eslint/**/*.ts',
            'scripts/**/*.ts',
            'skills/**/*.ts',
            'src/eslint-plugin/rules/**/*.ts',
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
