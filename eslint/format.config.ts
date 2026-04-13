import { formatConfig } from '../src/eslint-plugin/index.ts';

const config = [
    {
        ignores: [
            'dist/**',
            'skills/slop-refinery-setup/references/templates/**',
        ],
    },
    ...formatConfig,
];

export default config;
