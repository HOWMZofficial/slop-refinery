#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

import { pullRuleset, pushRuleset } from '../lib/index.ts';

type ParsedArguments = {
    options: {
        branch?: string;
        inputPath?: string;
        outputPath?: string;
    };
    positionals: string[];
    showHelp: boolean;
};

type ParseState = {
    nextValue: ParsedArguments;
    skipIndexes: number[];
};

function getUsage(): string {
    return [
        'Usage:',
        '  slop-refinery ruleset pull [--branch branch] [--output path]',
        '  slop-refinery ruleset push [--branch branch] [--input path]',
        '',
        'Requirements:',
        '  gh must be installed and authenticated for repository ruleset access.',
        '',
        'Options:',
        '  --branch  Target branch name. Defaults to main.',
        '  --input   Ruleset file path for push. Defaults to .github/rulesets/<branch>.json.',
        '  --output  Ruleset file path for pull. Defaults to .github/rulesets/<branch>.json.',
        '  --help    Show this message.',
    ].join('\n');
}

function readOptionValue(
    args: string[],
    index: number,
    optionName: string,
): string {
    const value = args[index];

    if (value === undefined) {
        throw new Error(`Expected ${optionName} to be followed by a value.`);
    }

    return value;
}

function getInitialParseState(): ParseState {
    return {
        nextValue: {
            options: {},
            positionals: [],
            showHelp: false,
        },
        skipIndexes: [],
    };
}

function addSkippedIndex(parseState: ParseState, index: number): ParseState {
    return {
        nextValue: parseState.nextValue,
        skipIndexes: [...parseState.skipIndexes, index],
    };
}

function setOption(
    parseState: ParseState,
    options: ParsedArguments['options'],
): ParseState {
    return {
        nextValue: {
            ...parseState.nextValue,
            options,
        },
        skipIndexes: parseState.skipIndexes,
    };
}

function parseArguments(args: string[]): ParsedArguments {
    if (args.includes('--help') || args.includes('-h')) {
        return {
            options: {},
            positionals: [],
            showHelp: true,
        };
    }

    return args.reduce<ParseState>((parseState, arg, index) => {
        if (parseState.skipIndexes.includes(index)) {
            return parseState;
        }

        if (arg === '--branch') {
            return addSkippedIndex(
                setOption(parseState, {
                    ...parseState.nextValue.options,
                    branch: readOptionValue(args, index + 1, '--branch'),
                }),
                index + 1,
            );
        }

        if (arg === '--input') {
            return addSkippedIndex(
                setOption(parseState, {
                    ...parseState.nextValue.options,
                    inputPath: readOptionValue(args, index + 1, '--input'),
                }),
                index + 1,
            );
        }

        if (arg === '--output') {
            return addSkippedIndex(
                setOption(parseState, {
                    ...parseState.nextValue.options,
                    outputPath: readOptionValue(args, index + 1, '--output'),
                }),
                index + 1,
            );
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        return {
            nextValue: {
                ...parseState.nextValue,
                positionals: [...parseState.nextValue.positionals, arg],
            },
            skipIndexes: parseState.skipIndexes,
        };
    }, getInitialParseState()).nextValue;
}

function parseRepoSlug(repoSlug: string): {
    owner: string;
    repo: string;
} {
    const [owner, repo, ...rest] = repoSlug.split('/');

    if (
        owner === undefined ||
        repo === undefined ||
        owner.length === 0 ||
        repo.length === 0 ||
        rest.length > 0
    ) {
        throw new Error(
            `Expected the origin remote to use owner/repo form, got ${repoSlug}.`,
        );
    }

    return { owner, repo };
}

function parseRemoteRepoSlug(remoteUrl: string): string | undefined {
    const trimmedRemoteUrl = remoteUrl.trim().replace(/\.git$/, '');

    if (trimmedRemoteUrl.startsWith('git@')) {
        const [, repoSlug] = trimmedRemoteUrl.split(':');

        return repoSlug;
    }

    try {
        const parsedUrl = new URL(trimmedRemoteUrl);

        return parsedUrl.pathname.replace(/^\//, '');
    } catch {
        return undefined;
    }
}

function inferRepoSlug(): string | undefined {
    try {
        const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });

        return parseRemoteRepoSlug(remoteUrl);
    } catch {
        return undefined;
    }
}

function getRepoCoordinates(): {
    owner: string;
    repo: string;
} {
    const resolvedRepoSlug = inferRepoSlug();

    if (resolvedRepoSlug === undefined) {
        throw new Error(
            'Could not determine the GitHub repository from the origin remote.',
        );
    }

    return parseRepoSlug(resolvedRepoSlug);
}

async function run(): Promise<void> {
    const parsedArguments = parseArguments(process.argv.slice(2));

    if (parsedArguments.showHelp || parsedArguments.positionals.length === 0) {
        console.log(getUsage());
        return;
    }

    const repoCoordinates = getRepoCoordinates();
    const [resource, action] = parsedArguments.positionals;

    if (resource !== 'ruleset') {
        throw new Error(`Unknown resource: ${resource}`);
    }

    if (action === 'pull') {
        await pullRuleset({
            ...repoCoordinates,
            branch: parsedArguments.options.branch,
            outputPath: parsedArguments.options.outputPath,
        });
        return;
    }

    if (action === 'push') {
        await pushRuleset({
            ...repoCoordinates,
            branch: parsedArguments.options.branch,
            inputPath: parsedArguments.options.inputPath,
        });
        return;
    }

    throw new Error(`Unknown action: ${action ?? '(missing)'}`);
}

await run().catch((error: unknown) => {
    const errorMessage =
        error instanceof Error ? error.message : 'Unknown CLI failure.';

    console.error(errorMessage);
    process.exitCode = 1;
});
