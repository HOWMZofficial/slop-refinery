import { execFileSync, spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'vitest';

const repoPath = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const repoPackageJson = readRepoPackageJson();
const consumerEslintRange = repoPackageJson.peerDependencies?.eslint;
const consumerTypeScriptRange = repoPackageJson.dependencies?.typescript;

function readRepoPackageJson(): {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
} {
    const parsedJson = JSON.parse(
        readFileSync(path.join(repoPath, 'package.json'), 'utf8'),
    );

    if (typeof parsedJson !== 'object' || parsedJson === null) {
        throw new Error('Expected package.json to contain an object.');
    }

    return parsedJson;
}

function runNpm(args: string[], cwd: string, captureOutput = false): string {
    return execFileSync(npmCommand, args, {
        cwd,
        encoding: 'utf8',
        stdio: captureOutput ? 'pipe' : 'inherit',
    });
}

function writeJsonFile(filePath: string, value: object): void {
    writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`);
}

function writeFile(filePath: string, content: string): void {
    writeFileSync(filePath, content.trimStart());
}

function expectNpmFailure(
    args: string[],
    cwd: string,
    expectedOutput: string,
): void {
    const result = spawnSync(npmCommand, args, {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
    });
    const combinedOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    if (result.status === 0) {
        throw new Error(
            `Expected npm ${args.join(' ')} to fail, but it succeeded.`,
        );
    }

    if (!combinedOutput.includes(expectedOutput)) {
        throw new Error(
            `Expected failing command output to contain "${expectedOutput}".`,
        );
    }
}

function readPackFilename(packOutput: string): string {
    const parsedOutput = JSON.parse(packOutput);

    if (!Array.isArray(parsedOutput) || parsedOutput.length === 0) {
        throw new Error('Expected npm pack JSON output to contain one entry.');
    }

    const [firstEntry] = parsedOutput;

    if (
        typeof firstEntry !== 'object' ||
        firstEntry === null ||
        !('filename' in firstEntry) ||
        typeof firstEntry.filename !== 'string'
    ) {
        throw new Error('Expected npm pack JSON output to include a filename.');
    }

    return firstEntry.filename;
}

function writeConsumerConfigFiles(consumerPath: string): void {
    writeJsonFile(path.join(consumerPath, 'package.json'), {
        name: 'slop-refinery-package-smoke-test',
        private: true,
        type: 'module',
    });
    writeJsonFile(path.join(consumerPath, 'tsconfig.json'), {
        compilerOptions: {
            allowImportingTsExtensions: true,
            esModuleInterop: true,
            module: 'ESNext',
            moduleResolution: 'bundler',
            noEmit: true,
            rewriteRelativeImportExtensions: true,
            skipLibCheck: true,
            strict: true,
            target: 'ESNext',
        },
    });
    writeFile(
        path.join(consumerPath, 'eslint.config.mjs'),
        `
            import { recommendedConfig } from 'eslint-plugin-slop-refinery';

            export default [...recommendedConfig];
        `,
    );
    writeFile(
        path.join(consumerPath, 'eslint.format.config.mjs'),
        `
            import { formatConfig } from 'eslint-plugin-slop-refinery';

            export default [...formatConfig];
        `,
    );
}

function writeConsumerSmokeFiles(consumerPath: string): void {
    writeFile(
        path.join(consumerPath, 'smoke.mjs'),
        `
            import {
                formatConfig,
                recommendedConfig,
                slopRefinery,
            } from 'eslint-plugin-slop-refinery';

            if (!Array.isArray(formatConfig)) {
                throw new Error('Expected formatConfig to be an array.');
            }

            if (!Array.isArray(recommendedConfig)) {
                throw new Error('Expected recommendedConfig to be an array.');
            }

            if (typeof slopRefinery !== 'object' || slopRefinery === null) {
                throw new Error('Expected slopRefinery to be an object.');
            }
        `,
    );
    writeFile(
        path.join(consumerPath, 'smoke.ts'),
        `
            import type { ESLint } from 'eslint';
            import {
                formatConfig,
                recommendedConfig,
                slopRefinery,
            } from 'eslint-plugin-slop-refinery';

            const recommended: ReturnType<typeof ESLint.prototype.calculateConfigForFile> | undefined =
                undefined;
            const configs = [recommendedConfig, formatConfig];
            const pluginName = slopRefinery.meta?.name;

            void recommended;
            void configs;
            void pluginName;
        `,
    );
}

function writeConsumerSourceFiles(srcPath: string): void {
    writeFile(
        path.join(srcPath, 'example-file.ts'),
        `
            import { read } from './read.ts';

            type User = {
                id: string;
            };

            function main(): void {
                const user: User = { id: '1' };
                read(user);
            }

            main();
        `,
    );
    writeFile(
        path.join(srcPath, 'read.ts'),
        `
            export function read(user: { id: string }): void {
                void user.id;
            }
        `,
    );
    writeFile(
        path.join(srcPath, 'invalid-default-export.ts'),
        `
            const value = 1;

            function main(): void {
                void value;
            }

            export default value;

            main();
        `,
    );
    writeFile(
        path.join(srcPath, 'ants.ts'),
        `
            export const ant = 1;
            export const bee = 2;
        `,
    );
    writeFile(
        path.join(srcPath, 'zoo.ts'),
        `
            export const apple = 1;
            export const zebra = 2;
        `,
    );
    writeFile(
        path.join(srcPath, 'format-example-file.ts'),
        `
            import { zebra, apple } from './zoo.ts';
            import { bee, ant } from './ants.ts';

            function main(): void {
                void ant;
                void apple;
                void bee;
                void zebra;
            }

            main();
        `,
    );
}

function installPackageForConsumer(
    consumerPath: string,
    tarballPath: string,
): void {
    if (consumerEslintRange === undefined) {
        throw new Error(
            'Expected package.json to define an eslint peer range.',
        );
    }

    if (consumerTypeScriptRange === undefined) {
        throw new Error(
            'Expected package.json to define a TypeScript dependency range.',
        );
    }

    runNpm(
        [
            'install',
            '--no-package-lock',
            `eslint@${consumerEslintRange}`,
            `typescript@${consumerTypeScriptRange}`,
            tarballPath,
        ],
        consumerPath,
    );
}

function assertConsumerImportsWork(consumerPath: string): void {
    execFileSync(process.execPath, ['smoke.mjs'], {
        cwd: consumerPath,
        stdio: 'inherit',
    });
    runNpm(['exec', '--', 'tsc', '--noEmit'], consumerPath);
}

function assertRecommendedConfigWorks(consumerPath: string): void {
    runNpm(
        [
            'exec',
            '--',
            'eslint',
            '--config',
            'eslint.config.mjs',
            'src/example-file.ts',
        ],
        consumerPath,
    );
    expectNpmFailure(
        [
            'exec',
            '--',
            'eslint',
            '--config',
            'eslint.config.mjs',
            'src/invalid-default-export.ts',
        ],
        consumerPath,
        'slop-refinery/no-default-export',
    );
}

function assertFormatConfigWorks(consumerPath: string, srcPath: string): void {
    runNpm(
        [
            'exec',
            '--',
            'eslint',
            '--fix',
            '--config',
            'eslint.format.config.mjs',
            'src/format-example-file.ts',
        ],
        consumerPath,
    );

    const formattedFile: string = readFileSync(
        path.join(srcPath, 'format-example-file.ts'),
        'utf8',
    );
    const hasSortedAntImport =
        formattedFile.includes("import { ant, bee } from './ants.ts';") ===
        true;
    const hasSortedZooImport =
        formattedFile.includes("import { apple, zebra } from './zoo.ts';") ===
        true;

    if (hasSortedAntImport === false || hasSortedZooImport === false) {
        throw new Error(
            'Expected formatConfig to sort imports in the consumer fixture.',
        );
    }
}

function createConsumerFixture(tempPath: string): {
    consumerPath: string;
    srcPath: string;
} {
    const consumerPath = path.join(tempPath, 'consumer');
    const srcPath = path.join(consumerPath, 'src');

    mkdirSync(srcPath, { recursive: true });
    writeConsumerConfigFiles(consumerPath);
    writeConsumerSmokeFiles(consumerPath);
    writeConsumerSourceFiles(srcPath);

    return { consumerPath, srcPath };
}

function packPublishedTarball(tempPath: string): string {
    const packOutput = runNpm(
        ['pack', '--json', '--pack-destination', tempPath],
        repoPath,
        true,
    );
    const filename = readPackFilename(packOutput);

    return path.join(tempPath, filename);
}

function runPackageSmokeTest(): void {
    const tempPath = mkdtempSync(
        path.join(os.tmpdir(), 'slop-refinery-package-test-'),
    );

    try {
        const tarballPath = packPublishedTarball(tempPath);
        const { consumerPath, srcPath } = createConsumerFixture(tempPath);

        installPackageForConsumer(consumerPath, tarballPath);
        assertConsumerImportsWork(consumerPath);
        assertRecommendedConfigWorks(consumerPath);
        assertFormatConfigWorks(consumerPath, srcPath);
    } finally {
        rmSync(path.join(repoPath, 'dist'), {
            force: true,
            recursive: true,
        });
        rmSync(tempPath, { force: true, recursive: true });
    }
}

it('publishes a working npm package', { timeout: 120_000 }, () => {
    runPackageSmokeTest();
});
