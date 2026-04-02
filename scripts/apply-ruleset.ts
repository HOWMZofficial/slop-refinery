import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type RulesetDefinition = {
    name: string;
};

const owner = 'HOWMZofficial';
const repo = 'slop-refinery';
const rulesetPath = path.join(
    process.cwd(),
    '.github',
    'rulesets',
    'main.json',
);

function runGh(args: string[], captureOutput = false): string {
    return execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: captureOutput ? 'pipe' : 'inherit',
    });
}

function readRulesetDefinition(): RulesetDefinition {
    const fileContent = readFileSync(rulesetPath, 'utf8');
    const parsedContent = JSON.parse(fileContent);

    if (
        typeof parsedContent !== 'object' ||
        parsedContent === null ||
        !('name' in parsedContent) ||
        typeof parsedContent.name !== 'string'
    ) {
        throw new Error(
            'Expected .github/rulesets/main.json to define a name.',
        );
    }

    return parsedContent;
}

function findExistingRulesetId(rulesetName: string): string | undefined {
    const output = runGh(
        [
            'api',
            `repos/${owner}/${repo}/rulesets`,
            '--jq',
            `.[]
            | select(.name == "${rulesetName}")
            | .id`,
        ],
        true,
    ).trim();

    if (output === '') {
        return undefined;
    }

    return output;
}

function applyRuleset(rulesetId: string | undefined): void {
    const endpoint =
        rulesetId === undefined
            ? `repos/${owner}/${repo}/rulesets`
            : `repos/${owner}/${repo}/rulesets/${rulesetId}`;
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

function deleteClassicBranchProtection(): void {
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

const rulesetDefinition = readRulesetDefinition();
const existingRulesetId = findExistingRulesetId(rulesetDefinition.name);

applyRuleset(existingRulesetId);
deleteClassicBranchProtection();
