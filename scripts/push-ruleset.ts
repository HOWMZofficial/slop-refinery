import {
    applyCheckedInRuleset,
    deleteClassicBranchProtection,
    findMainBranchRuleset,
    readCheckedInRuleset,
} from './ruleset-helpers.ts';

readCheckedInRuleset();
const existingRuleset = findMainBranchRuleset();

applyCheckedInRuleset(existingRuleset?.id);
deleteClassicBranchProtection();
