import { recommendedConfig } from '../src/index.ts';

const config = [
    {
        ignores: ['dist/**'],
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
