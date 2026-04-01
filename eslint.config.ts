import { slopRefinery, strictConfig } from './src/index.ts';

const config = [
    ...strictConfig,
    {
        files: [
            'eslint.config.ts',
            'scripts/**/*.ts',
            'src/**/*.ts',
            'skills/**/*.ts',
            'tests/**/*.ts',
        ],
        rules: {
            'slop-refinery/function-order': 'off',
            'slop-refinery/init-at-bottom': 'off',
        },
    },
    {
        files: [
            'scripts/**/*.ts',
            'skills/**/*.ts',
            'src/rules/**/*.ts',
            'tests/test-harness.ts',
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        plugins: {
            'slop-refinery': slopRefinery,
        },
    },
];

export default config;
