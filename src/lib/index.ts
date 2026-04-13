import type { RepoCoordinates as RepoCoordinatesType } from './ruleset/github.ts';
import type {
    PullRulesetOptions as PullRulesetOptionsType,
    PushRulesetOptions as PushRulesetOptionsType,
    RulesetTargetingOptions as RulesetTargetingOptionsType,
} from './ruleset/operations.ts';
import type {
    RulesetBypassActor as RulesetBypassActorType,
    RulesetCondition as RulesetConditionType,
    RulesetDefinition as RulesetDefinitionType,
    RulesetDetail as RulesetDetailType,
    RulesetRule as RulesetRuleType,
    RulesetSummary as RulesetSummaryType,
} from './ruleset/types.ts';

import {
    getDefaultRulesetPath,
    readRulesetFile,
    writeRulesetFile,
} from './ruleset/files.ts';
import {
    findBranchRuleset,
    normalizeRuleset,
    pullRuleset,
    pushRuleset,
} from './ruleset/operations.ts';

export type RepoCoordinates = RepoCoordinatesType;
export type PullRulesetOptions = PullRulesetOptionsType;
export type PushRulesetOptions = PushRulesetOptionsType;
export type RulesetTargetingOptions = RulesetTargetingOptionsType;
export type RulesetBypassActor = RulesetBypassActorType;
export type RulesetCondition = RulesetConditionType;
export type RulesetDefinition = RulesetDefinitionType;
export type RulesetDetail = RulesetDetailType;
export type RulesetRule = RulesetRuleType;
export type RulesetSummary = RulesetSummaryType;
export {
    findBranchRuleset,
    getDefaultRulesetPath,
    normalizeRuleset,
    pullRuleset,
    pushRuleset,
    readRulesetFile,
    writeRulesetFile,
};
