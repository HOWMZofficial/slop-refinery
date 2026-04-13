import type { RulesetDefinition, RulesetDetail } from './types.ts';

import {
    defaultBranchName,
    getDefaultRulesetPath,
    readRulesetFile,
    writeRulesetFile,
} from './files.ts';
import {
    listRulesetSummaries,
    readRepositoryDefaultBranch,
    readRulesetDetail,
    type RepoCoordinates,
    upsertRuleset,
} from './github.ts';

export type RulesetTargetingOptions = {
    branch?: string;
    cwd?: string;
} & RepoCoordinates;

export type PullRulesetOptions = {
    outputPath?: string;
} & RulesetTargetingOptions;

export type PushRulesetOptions = {
    inputPath?: string;
} & RulesetTargetingOptions;

function getBranchName(branch: string | undefined): string {
    return branch ?? defaultBranchName;
}

function getRefName(branch: string): string {
    return `refs/heads/${branch}`;
}

function resolveRulesetPath(
    filePath: string | undefined,
    options: {
        branch?: string;
        cwd?: string;
    },
): string {
    return filePath ?? getDefaultRulesetPath(options);
}

function branchMatchesCondition(
    refNames: string[],
    branch: string,
    defaultBranch: string,
): boolean {
    return (
        refNames.includes(getRefName(branch)) ||
        (branch === defaultBranch && refNames.includes('~DEFAULT_BRANCH'))
    );
}

function targetsBranch(
    rulesetDetail: RulesetDetail,
    branch: string,
    defaultBranch: string,
): boolean {
    const refNameCondition = rulesetDetail.conditions.ref_name;

    return (
        rulesetDetail.target === 'branch' &&
        branchMatchesCondition(
            refNameCondition.include,
            branch,
            defaultBranch,
        ) &&
        branchMatchesCondition(
            refNameCondition.exclude,
            branch,
            defaultBranch,
        ) === false
    );
}

export function normalizeRuleset(
    rulesetDetail: RulesetDetail,
): RulesetDefinition {
    return {
        bypass_actors: rulesetDetail.bypass_actors,
        conditions: rulesetDetail.conditions,
        enforcement: rulesetDetail.enforcement,
        name: rulesetDetail.name,
        rules: rulesetDetail.rules,
        target: rulesetDetail.target,
    };
}

export async function findBranchRuleset(
    options: RulesetTargetingOptions,
): Promise<RulesetDetail | undefined> {
    const branch = getBranchName(options.branch);
    const defaultBranch = await readRepositoryDefaultBranch(options);
    const rulesetSummaries = await listRulesetSummaries(options);

    for (const rulesetSummary of rulesetSummaries) {
        const rulesetDetail = await readRulesetDetail({
            ...options,
            rulesetId: rulesetSummary.id,
        });

        if (targetsBranch(rulesetDetail, branch, defaultBranch)) {
            return rulesetDetail;
        }
    }

    return undefined;
}

export async function pullRuleset(
    options: PullRulesetOptions,
): Promise<RulesetDefinition> {
    const branch = getBranchName(options.branch);
    const rulesetDetail = await findBranchRuleset({ ...options, branch });

    if (rulesetDetail === undefined) {
        throw new Error(
            `Expected a live ruleset targeting refs/heads/${branch}.`,
        );
    }

    const normalizedRuleset = normalizeRuleset(rulesetDetail);

    writeRulesetFile(
        resolveRulesetPath(options.outputPath, options),
        normalizedRuleset,
    );

    return normalizedRuleset;
}

export async function pushRuleset(
    options: PushRulesetOptions,
): Promise<RulesetDetail> {
    const branch = getBranchName(options.branch);
    const existingRuleset = await findBranchRuleset({ ...options, branch });
    const writtenRuleset = await upsertRuleset({
        ...options,
        rulesetDefinition: readRulesetFile(
            resolveRulesetPath(options.inputPath, options),
        ),
        rulesetId: existingRuleset?.id,
    });

    if (writtenRuleset !== undefined) {
        return writtenRuleset;
    }

    const refreshedRuleset = await findBranchRuleset({ ...options, branch });

    if (refreshedRuleset === undefined) {
        throw new Error(
            `Expected ruleset write to create or update refs/heads/${branch}.`,
        );
    }

    return refreshedRuleset;
}
