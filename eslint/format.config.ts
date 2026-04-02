import { formatConfig } from '../src/index.ts';

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
