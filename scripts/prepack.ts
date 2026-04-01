import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tscPath = require.resolve('typescript/bin/tsc');

rmSync('dist', { force: true, recursive: true });

execFileSync(
    process.execPath,
    [
        tscPath,
        '--project',
        'tsconfig.json',
        '--noEmit',
        'false',
        '--declaration',
        'true',
        '--declarationMap',
        'true',
        '--sourceMap',
        'true',
        '--outDir',
        './dist',
        '--rootDir',
        '.',
    ],
    {
        stdio: 'inherit',
    },
);
