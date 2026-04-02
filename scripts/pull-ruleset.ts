import {
    findMainBranchRuleset,
    normalizeRuleset,
    writeCheckedInRuleset,
} from './ruleset-helpers.ts';

const mainBranchRuleset = findMainBranchRuleset();

if (mainBranchRuleset === undefined) {
    throw new Error('Expected a live ruleset targeting refs/heads/main.');
}

writeCheckedInRuleset(normalizeRuleset(mainBranchRuleset));
