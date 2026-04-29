#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

import {
    buildGitCleanupReport,
    getGitCleanupUsage,
    parseGitCleanupArgs,
    pullRuleset,
    pushRuleset,
    renderGitCleanupOutput,
} from '../lib/index.ts';

type ParsedRulesetArguments = {
    action: 'pull' | 'push' | null;
    options: {
        branch?: string;
        inputPath?: string;
        outputPath?: string;
    };
    showHelp: boolean;
};

type RulesetParseState = {
    nextValue: ParsedRulesetArguments;
    skipIndexes: number[];
};

function getUsage(): string {
    return [
        'Usage:',
        '  slop-refinery ruleset pull [--branch branch] [--output path]',
        '  slop-refinery ruleset push [--branch branch] [--input path]',
        '  slop-refinery git-cleanup [--apply] [--prune-archives] [--keep-archives] [--base ref] [--json]',
        '',
        'Commands:',
        '  ruleset      Pull or push the repository ruleset through GitHub CLI.',
        "  git-cleanup  Audit local branches and worktrees against origin's live default branch.",
        '',
        'Requirements:',
        '  ruleset commands require gh to be installed and authenticated.',
        '  git-cleanup requires a git repo with an origin remote.',
        '',
        'Run `slop-refinery <command> --help` for command-specific help.',
    ].join('\n');
}

function readOptionValue(
    args: readonly string[],
    index: number,
    optionName: string,
): string {
    const value = args[index];

    if (value === undefined) {
        throw new Error(`Expected ${optionName} to be followed by a value.`);
    }

    return value;
}

function getInitialRulesetParseState(): RulesetParseState {
    return {
        nextValue: {
            action: null,
            options: {},
            showHelp: false,
        },
        skipIndexes: [],
    };
}

function addSkippedIndex(
    parseState: RulesetParseState,
    index: number,
): RulesetParseState {
    return {
        nextValue: parseState.nextValue,
        skipIndexes: [...parseState.skipIndexes, index],
    };
}

function setRulesetOptions(
    parseState: RulesetParseState,
    options: ParsedRulesetArguments['options'],
): RulesetParseState {
    return {
        nextValue: {
            ...parseState.nextValue,
            options,
        },
        skipIndexes: parseState.skipIndexes,
    };
}

function parseRulesetArguments(
    args: readonly string[],
): ParsedRulesetArguments {
    if (args.includes('--help') || args.includes('-h')) {
        return {
            action: null,
            options: {},
            showHelp: true,
        };
    }

    return args.reduce<RulesetParseState>((parseState, arg, index) => {
        if (parseState.skipIndexes.includes(index)) {
            return parseState;
        }

        if (arg === '--branch') {
            return addSkippedIndex(
                setRulesetOptions(parseState, {
                    ...parseState.nextValue.options,
                    branch: readOptionValue(args, index + 1, '--branch'),
                }),
                index + 1,
            );
        }

        if (arg === '--input') {
            return addSkippedIndex(
                setRulesetOptions(parseState, {
                    ...parseState.nextValue.options,
                    inputPath: readOptionValue(args, index + 1, '--input'),
                }),
                index + 1,
            );
        }

        if (arg === '--output') {
            return addSkippedIndex(
                setRulesetOptions(parseState, {
                    ...parseState.nextValue.options,
                    outputPath: readOptionValue(args, index + 1, '--output'),
                }),
                index + 1,
            );
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        if (parseState.nextValue.action !== null) {
            throw new Error(`Unexpected positional argument: ${arg}`);
        }

        if (arg !== 'pull' && arg !== 'push') {
            throw new Error(`Unknown action: ${arg}`);
        }

        return {
            nextValue: {
                ...parseState.nextValue,
                action: arg,
            },
            skipIndexes: parseState.skipIndexes,
        };
    }, getInitialRulesetParseState()).nextValue;
}

function getRulesetUsage(): string {
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

function getGitCleanupApplyCommand(): string {
    return process.env.npm_lifecycle_event === 'git-cleanup'
        ? 'npm run git-cleanup -- --apply'
        : 'slop-refinery git-cleanup --apply';
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
    const [resource, ...resourceArgs] = process.argv.slice(2);

    if (resource === undefined || resource === '--help' || resource === '-h') {
        console.log(getUsage());
        return;
    }

    if (resource === 'ruleset') {
        const parsedArguments = parseRulesetArguments(resourceArgs);

        if (parsedArguments.showHelp || parsedArguments.action === null) {
            console.log(getRulesetUsage());
            return;
        }

        const repoCoordinates = getRepoCoordinates();

        if (parsedArguments.action === 'pull') {
            await pullRuleset({
                ...repoCoordinates,
                branch: parsedArguments.options.branch,
                outputPath: parsedArguments.options.outputPath,
            });
            return;
        }

        await pushRuleset({
            ...repoCoordinates,
            branch: parsedArguments.options.branch,
            inputPath: parsedArguments.options.inputPath,
        });
        return;
    }

    if (resource === 'git-cleanup') {
        if (resourceArgs.includes('--help') || resourceArgs.includes('-h')) {
            console.log(getGitCleanupUsage());
            return;
        }

        const options = {
            ...parseGitCleanupArgs(resourceArgs),
            applyCommand: getGitCleanupApplyCommand(),
        };
        const report = buildGitCleanupReport(options);

        console.log(renderGitCleanupOutput(report, options.json));
        return;
    }

    throw new Error(`Unknown resource: ${resource}`);
}

await run().catch((error: unknown) => {
    const errorMessage =
        error instanceof Error ? error.message : 'Unknown CLI failure.';

    console.error(errorMessage);
    process.exitCode = 1;
});
