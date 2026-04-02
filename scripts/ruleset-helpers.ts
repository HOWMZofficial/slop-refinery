import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type RulesetCondition = {
    ref_name: {
        exclude: string[];
        include: string[];
    };
};

type RulesetBypassActor = {
    actor_id: null | number;
    actor_type: string;
    bypass_mode: string;
};

type RulesetRule = {
    parameters?: Record<string, unknown>;
    type: string;
};

type RulesetSummary = {
    id: number;
};

export type RulesetDefinition = {
    bypass_actors: RulesetBypassActor[];
    conditions: RulesetCondition;
    enforcement: string;
    name: string;
    rules: RulesetRule[];
    target: string;
};

export type RulesetDetail = {
    id: number;
} & RulesetDefinition;

const owner = 'HOWMZofficial';
const repo = 'slop-refinery';

export const rulesetPath = path.join(
    process.cwd(),
    '.github',
    'rulesets',
    'main.json',
);

export function runGh(args: string[], captureOutput = false): string {
    return execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: captureOutput ? 'pipe' : 'inherit',
    });
}

function isRulesetSummary(value: unknown): value is RulesetSummary {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'number'
    );
}

function isRulesetDefinition(value: unknown): value is RulesetDefinition {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        typeof value.name === 'string' &&
        'target' in value &&
        typeof value.target === 'string' &&
        'enforcement' in value &&
        typeof value.enforcement === 'string' &&
        'bypass_actors' in value &&
        Array.isArray(value.bypass_actors) &&
        'conditions' in value &&
        typeof value.conditions === 'object' &&
        value.conditions !== null &&
        'rules' in value &&
        Array.isArray(value.rules)
    );
}

function isRulesetDetail(value: unknown): value is RulesetDetail {
    return (
        isRulesetDefinition(value) &&
        'id' in value &&
        typeof value.id === 'number'
    );
}

function listRulesetSummaries(): RulesetSummary[] {
    const output = runGh(['api', `repos/${owner}/${repo}/rulesets`], true);
    const parsedOutput = JSON.parse(output);

    if (!Array.isArray(parsedOutput)) {
        throw new Error('Expected GitHub rulesets response to be an array.');
    }

    return parsedOutput.filter(isRulesetSummary);
}

function readRulesetDetail(id: number): RulesetDetail {
    const output = runGh(
        ['api', `repos/${owner}/${repo}/rulesets/${String(id)}`],
        true,
    );
    const parsedOutput = JSON.parse(output);

    if (!isRulesetDetail(parsedOutput)) {
        throw new Error('Expected GitHub ruleset detail response.');
    }

    return parsedOutput;
}

function targetsMainBranch(rulesetDetail: RulesetDetail): boolean {
    return (
        rulesetDetail.target === 'branch' &&
        rulesetDetail.conditions.ref_name.include.includes('refs/heads/main')
    );
}

export function findMainBranchRuleset(): RulesetDetail | undefined {
    const rulesetSummaries = listRulesetSummaries();

    for (const rulesetSummary of rulesetSummaries) {
        const rulesetDetail = readRulesetDetail(rulesetSummary.id);

        if (targetsMainBranch(rulesetDetail)) {
            return rulesetDetail;
        }
    }

    return undefined;
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

export function readCheckedInRuleset(): RulesetDefinition {
    const fileContent = readFileSync(rulesetPath, 'utf8');
    const parsedContent = JSON.parse(fileContent);

    if (!isRulesetDefinition(parsedContent)) {
        throw new Error(
            'Expected .github/rulesets/main.json to define a ruleset.',
        );
    }

    return parsedContent;
}

export function writeCheckedInRuleset(
    rulesetDefinition: RulesetDefinition,
): void {
    writeFileSync(
        rulesetPath,
        `${JSON.stringify(rulesetDefinition, null, 4)}\n`,
    );
}

export function applyCheckedInRuleset(rulesetId: number | undefined): void {
    const endpoint =
        rulesetId === undefined
            ? `repos/${owner}/${repo}/rulesets`
            : `repos/${owner}/${repo}/rulesets/${String(rulesetId)}`;
    const method = rulesetId === undefined ? 'POST' : 'PUT';

    runGh([
        'api',
        '-X',
        method,
        '-H',
        'Accept: application/vnd.github+json',
        endpoint,
        '--input',
        rulesetPath,
    ]);
}

export function deleteClassicBranchProtection(): void {
    try {
        runGh([
            'api',
            '-X',
            'DELETE',
            `repos/${owner}/${repo}/branches/main/protection`,
        ]);
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        if (!errorMessage.includes('Branch not protected')) {
            throw error;
        }
    }
}
