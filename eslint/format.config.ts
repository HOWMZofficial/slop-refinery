import { formatConfig } from '../src/index.ts';

const config = [
    {
        ignores: ['dist/**'],
    },
    ...formatConfig,
];

export default config;
