import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isRulesetDefinition, type RulesetDefinition } from './types.ts';

export const defaultBranchName = 'main';

export function getDefaultRulesetPath(options?: {
    branch?: string;
    cwd?: string;
}): string {
    const branch = options?.branch ?? defaultBranchName;
    const cwd = options?.cwd ?? process.cwd();

    return path.join(cwd, '.github', 'rulesets', `${branch}.json`);
}

export function readRulesetFile(filePath: string): RulesetDefinition {
    const parsedContent: unknown = JSON.parse(readFileSync(filePath, 'utf8'));

    if (isRulesetDefinition(parsedContent) === false) {
        throw new Error(`Expected ${filePath} to define a ruleset.`);
    }

    return parsedContent;
}

export function writeRulesetFile(
    filePath: string,
    rulesetDefinition: RulesetDefinition,
): void {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(rulesetDefinition, null, 4)}\n`);
}
