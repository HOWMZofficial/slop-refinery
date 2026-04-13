import { execFileSync, spawnSync } from 'node:child_process';
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type FakeGhState = {
    calls: Array<{
        endpoint: string | undefined;
        method: string;
    }>;
    defaultBranch: string;
    repoSlug: string;
    rulesetDetails: Record<string, object>;
    rulesetSummaries: Array<{
        id: number;
    }>;
    writes: Array<{
        endpoint: string | undefined;
        method: string;
        payload: unknown;
    }>;
};

function isNonNullObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function hasFakeGhStateKeys(value: Record<string, unknown>): boolean {
    return (
        'calls' in value &&
        'defaultBranch' in value &&
        'repoSlug' in value &&
        'rulesetDetails' in value &&
        'rulesetSummaries' in value &&
        'writes' in value
    );
}

function hasFakeGhStateValueTypes(value: Record<string, unknown>): boolean {
    return (
        Array.isArray(value.calls) &&
        typeof value.defaultBranch === 'string' &&
        typeof value.repoSlug === 'string' &&
        isNonNullObject(value.rulesetDetails) &&
        Array.isArray(value.rulesetSummaries) &&
        Array.isArray(value.writes)
    );
}

function isFakeGhState(value: unknown): value is FakeGhState {
    return (
        isNonNullObject(value) &&
        hasFakeGhStateKeys(value) &&
        hasFakeGhStateValueTypes(value)
    );
}

const repoPath = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function parseRemoteRepoSlug(remoteUrl: string): string {
    const trimmedRemoteUrl = remoteUrl.trim().replace(/\.git$/, '');

    if (trimmedRemoteUrl.startsWith('git@')) {
        const [, repoSlug] = trimmedRemoteUrl.split(':');

        if (repoSlug !== undefined && repoSlug.length > 0) {
            return repoSlug;
        }
    }

    const parsedUrl = new URL(trimmedRemoteUrl);
    const repoSlug = parsedUrl.pathname.replace(/^\//, '');

    if (repoSlug.length === 0) {
        throw new Error(`Expected a repo slug in ${remoteUrl}.`);
    }

    return repoSlug;
}

function readRepoSlug(): string {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: repoPath,
        encoding: 'utf8',
    });

    return parseRemoteRepoSlug(remoteUrl);
}

function writeFakeGhExecutable(tempPath: string): string {
    const binDirectoryPath = path.join(tempPath, 'bin');
    const executablePath = path.join(binDirectoryPath, 'gh');

    mkdirSync(binDirectoryPath, { recursive: true });
    writeFileSync(
        executablePath,
        [
            '#!/usr/bin/env node',
            "const fs = require('node:fs');",
            'const statePath = process.env.SLOP_REFINERY_FAKE_GH_STATE;',
            "const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));",
            'const args = process.argv.slice(2);',
            "const stdin = fs.readFileSync(0, 'utf8');",
            'let endpoint;',
            "let method = 'GET';",
            'for (let index = 0; index < args.length; index += 1) {',
            '    const arg = args[index];',
            "    if (arg === 'api') {",
            '        continue;',
            '    }',
            "    if (arg === '-X') {",
            '        method = args[index + 1] ?? method;',
            '        index += 1;',
            '        continue;',
            '    }',
            "    if (arg === '-H' || arg === '--input') {",
            '        index += 1;',
            '        continue;',
            '    }',
            "    if (arg.startsWith('-')) {",
            '        continue;',
            '    }',
            '    endpoint = arg;',
            '}',
            'state.calls.push({ endpoint, method });',
            'function writeState() {',
            '    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 4)}\\n`);',
            '}',
            'if (endpoint === `repos/${state.repoSlug}`) {',
            '    writeState();',
            '    process.stdout.write(JSON.stringify({ default_branch: state.defaultBranch }));',
            '    process.exit(0);',
            '}',
            "if (endpoint === `repos/${state.repoSlug}/rulesets` && method === 'GET') {",
            '    writeState();',
            '    process.stdout.write(JSON.stringify(state.rulesetSummaries));',
            '    process.exit(0);',
            '}',
            "if (endpoint !== undefined && endpoint.startsWith(`repos/${state.repoSlug}/rulesets/`) && method === 'GET') {",
            "    const rulesetId = endpoint.split('/').at(-1);",
            '    const rulesetDetail = rulesetId === undefined ? undefined : state.rulesetDetails[rulesetId];',
            '    if (rulesetDetail === undefined) {',
            '        console.error(`Missing fake ruleset detail for ${endpoint}.`);',
            '        process.exit(1);',
            '    }',
            '    writeState();',
            '    process.stdout.write(JSON.stringify(rulesetDetail));',
            '    process.exit(0);',
            '}',
            "if ((method === 'POST' || method === 'PUT') && endpoint !== undefined) {",
            "    const payload = JSON.parse(stdin || '{}');",
            '    state.writes.push({ endpoint, method, payload });',
            '    writeState();',
            '    process.stdout.write(JSON.stringify({ ...payload, id: 1 }));',
            '    process.exit(0);',
            '}',
            'writeState();',
            'console.error(`Unexpected gh invocation: ${JSON.stringify({ args, endpoint, method })}`);',
            'process.exit(1);',
        ].join('\n'),
    );
    chmodSync(executablePath, 0o755);

    return binDirectoryPath;
}

function createFakeGhEnvironment(
    state: Omit<FakeGhState, 'calls' | 'writes'>,
): {
    readState(): FakeGhState;
    remove(): void;
    variables: NodeJS.ProcessEnv;
} {
    const tempPath = mkdtempSync(path.join(os.tmpdir(), 'slop-refinery-cli-'));
    const statePath = path.join(tempPath, 'gh-state.json');
    const binDirectoryPath = writeFakeGhExecutable(tempPath);
    const initialState: FakeGhState = {
        ...state,
        calls: [],
        writes: [],
    };

    writeFileSync(statePath, `${JSON.stringify(initialState, null, 4)}\n`);

    return {
        readState(): FakeGhState {
            const parsedState: unknown = JSON.parse(
                readFileSync(statePath, 'utf8'),
            );

            if (isFakeGhState(parsedState) === false) {
                throw new Error(
                    'Expected fake gh state to have the right shape.',
                );
            }

            return parsedState;
        },
        remove(): void {
            rmSync(tempPath, { force: true, recursive: true });
        },
        variables: {
            ...process.env,
            PATH: `${binDirectoryPath}${path.delimiter}${process.env.PATH ?? ''}`,
            SLOP_REFINERY_FAKE_GH_STATE: statePath,
        },
    };
}

function runRulesetScript(
    scriptName: 'ruleset:pull' | 'ruleset:push',
    args: string[],
    env: NodeJS.ProcessEnv,
): {
    output: string;
    status: null | number;
} {
    const result = spawnSync(npmCommand, ['run', scriptName, '--', ...args], {
        cwd: repoPath,
        encoding: 'utf8',
        env,
        stdio: 'pipe',
    });

    return {
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
        status: result.status,
    };
}

describe('ruleset CLI scripts', () => {
    it('runs ruleset:pull end to end with gh stubbed', () => {
        const fakeGh = createFakeGhEnvironment({
            defaultBranch: 'main',
            repoSlug: readRepoSlug(),
            rulesetDetails: {
                '1': {
                    bypass_actors: [],
                    conditions: {
                        ref_name: {
                            exclude: [],
                            include: ['~DEFAULT_BRANCH'],
                        },
                    },
                    enforcement: 'active',
                    id: 1,
                    name: 'main branch ruleset',
                    rules: [],
                    target: 'branch',
                },
            },
            rulesetSummaries: [{ id: 1 }],
        });
        const outputPath = path.join(
            os.tmpdir(),
            `slop-refinery-ruleset-pull-${Date.now()}.json`,
        );

        try {
            const result = runRulesetScript(
                'ruleset:pull',
                ['--output', outputPath],
                fakeGh.variables,
            );

            expect(result.status).toBe(0);
            expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toStrictEqual({
                bypass_actors: [],
                conditions: {
                    ref_name: {
                        exclude: [],
                        include: ['~DEFAULT_BRANCH'],
                    },
                },
                enforcement: 'active',
                name: 'main branch ruleset',
                rules: [],
                target: 'branch',
            });
            expect(fakeGh.readState().calls).toStrictEqual([
                {
                    endpoint: `repos/${readRepoSlug()}`,
                    method: 'GET',
                },
                {
                    endpoint: `repos/${readRepoSlug()}/rulesets`,
                    method: 'GET',
                },
                {
                    endpoint: `repos/${readRepoSlug()}/rulesets/1`,
                    method: 'GET',
                },
            ]);
        } finally {
            rmSync(outputPath, { force: true });
            fakeGh.remove();
        }
    });

    it('runs ruleset:push end to end with gh stubbed', () => {
        const fakeGh = createFakeGhEnvironment({
            defaultBranch: 'main',
            repoSlug: readRepoSlug(),
            rulesetDetails: {
                '7': {
                    bypass_actors: [],
                    conditions: {
                        ref_name: {
                            exclude: [],
                            include: ['refs/heads/main'],
                        },
                    },
                    enforcement: 'active',
                    id: 7,
                    name: 'main branch ruleset',
                    rules: [],
                    target: 'branch',
                },
            },
            rulesetSummaries: [{ id: 7 }],
        });
        const inputPath = path.join(
            os.tmpdir(),
            `slop-refinery-ruleset-push-${Date.now()}.json`,
        );
        const rulesetDefinition = {
            bypass_actors: [],
            conditions: {
                ref_name: {
                    exclude: [],
                    include: ['refs/heads/main'],
                },
            },
            enforcement: 'active',
            name: 'main branch ruleset',
            rules: [],
            target: 'branch',
        };

        writeFileSync(
            inputPath,
            `${JSON.stringify(rulesetDefinition, null, 4)}\n`,
        );

        try {
            const result = runRulesetScript(
                'ruleset:push',
                ['--input', inputPath],
                fakeGh.variables,
            );

            expect(result.status).toBe(0);
            expect(fakeGh.readState().writes).toStrictEqual([
                {
                    endpoint: `repos/${readRepoSlug()}/rulesets/7`,
                    method: 'PUT',
                    payload: rulesetDefinition,
                },
            ]);
        } finally {
            rmSync(inputPath, { force: true });
            fakeGh.remove();
        }
    });
});
