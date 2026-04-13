import { execFileSync } from 'node:child_process';

import {
    isRulesetDetail,
    isRulesetSummary,
    type RulesetDefinition,
    type RulesetDetail,
    type RulesetSummary,
} from './types.ts';

export type RepoCoordinates = {
    owner: string;
    repo: string;
};

type GitHubRequestOptions = RepoCoordinates;

type RepositoryDetail = {
    default_branch: string;
};

type ExecFileError = {
    code?: string;
    stderr?: Buffer | string;
    stdout?: Buffer | string;
} & Error;

type RunGhOptions = {
    captureOutput?: boolean;
    input?: string;
};

function readExecErrorOutput(errorOutput: Buffer | string | undefined): string {
    if (errorOutput === undefined) {
        return '';
    }

    if (typeof errorOutput === 'string') {
        return errorOutput.trim();
    }

    return errorOutput.toString('utf8').trim();
}

function getGhFailureMessage(error: ExecFileError): string {
    if (error.code === 'ENOENT') {
        return 'GitHub CLI `gh` is required but was not found in PATH.';
    }

    const stderr = readExecErrorOutput(error.stderr);

    if (stderr.length > 0) {
        return stderr;
    }

    const stdout = readExecErrorOutput(error.stdout);

    if (stdout.length > 0) {
        return stdout;
    }

    return error.message;
}

function runGh(args: string[], options?: RunGhOptions): string {
    try {
        return execFileSync('gh', args, {
            encoding: 'utf8',
            input: options?.input,
            stdio:
                options?.captureOutput === true
                    ? ['pipe', 'pipe', 'pipe']
                    : ['pipe', 'inherit', 'inherit'],
        });
    } catch (error) {
        if (error instanceof Error === false) {
            throw error;
        }

        throw new Error(getGhFailureMessage(error), {
            cause: error,
        });
    }
}

function parseJsonOutput(output: string): unknown {
    const trimmedOutput = output.trim();

    if (trimmedOutput.length === 0) {
        return undefined;
    }

    const parsedOutput: unknown = JSON.parse(trimmedOutput);

    return parsedOutput;
}

function isRepositoryDetail(value: unknown): value is RepositoryDetail {
    return (
        typeof value === 'object' &&
        value !== null &&
        'default_branch' in value &&
        typeof value.default_branch === 'string'
    );
}

export async function listRulesetSummaries(
    options: GitHubRequestOptions,
): Promise<RulesetSummary[]> {
    const parsedResponse = parseJsonOutput(
        runGh(['api', `repos/${options.owner}/${options.repo}/rulesets`], {
            captureOutput: true,
        }),
    );

    if (Array.isArray(parsedResponse) === false) {
        throw new Error('Expected GitHub rulesets response to be an array.');
    }

    return parsedResponse.filter(isRulesetSummary);
}

export async function readRulesetDetail(
    options: {
        rulesetId: number;
    } & GitHubRequestOptions,
): Promise<RulesetDetail> {
    const parsedResponse = parseJsonOutput(
        runGh(
            [
                'api',
                `repos/${options.owner}/${options.repo}/rulesets/${String(
                    options.rulesetId,
                )}`,
            ],
            {
                captureOutput: true,
            },
        ),
    );

    if (isRulesetDetail(parsedResponse) === false) {
        throw new Error('Expected GitHub ruleset detail response.');
    }

    return parsedResponse;
}

export async function readRepositoryDefaultBranch(
    options: GitHubRequestOptions,
): Promise<string> {
    const parsedResponse = parseJsonOutput(
        runGh(['api', `repos/${options.owner}/${options.repo}`], {
            captureOutput: true,
        }),
    );

    if (isRepositoryDetail(parsedResponse) === false) {
        throw new Error(
            'Expected GitHub repository response to include default_branch.',
        );
    }

    return parsedResponse.default_branch;
}

export async function upsertRuleset(
    options: {
        rulesetDefinition: RulesetDefinition;
        rulesetId: number | undefined;
    } & GitHubRequestOptions,
): Promise<RulesetDetail | undefined> {
    const parsedResponse = parseJsonOutput(
        runGh(
            [
                'api',
                '-X',
                options.rulesetId === undefined ? 'POST' : 'PUT',
                '-H',
                'Accept: application/vnd.github+json',
                options.rulesetId === undefined
                    ? `repos/${options.owner}/${options.repo}/rulesets`
                    : `repos/${options.owner}/${options.repo}/rulesets/${String(
                          options.rulesetId,
                      )}`,
                '--input',
                '-',
            ],
            {
                captureOutput: true,
                input: `${JSON.stringify(options.rulesetDefinition)}\n`,
            },
        ),
    );

    if (parsedResponse === undefined) {
        return undefined;
    }

    if (isRulesetDetail(parsedResponse) === false) {
        throw new Error('Expected GitHub ruleset write response.');
    }

    return parsedResponse;
}
