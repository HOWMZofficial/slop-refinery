import type {
    GitCleanupApplyResult as GitCleanupApplyResultType,
    GitCleanupArchivePruneResult as GitCleanupArchivePruneResultType,
    GitCleanupBranchBuckets as GitCleanupBranchBucketsType,
    GitCleanupBranchReport as GitCleanupBranchReportType,
    GitCleanupBranchState as GitCleanupBranchStateType,
    GitCleanupDetachedWorktreeReport as GitCleanupDetachedWorktreeReportType,
    GitCleanupDetachedWorktreeState as GitCleanupDetachedWorktreeStateType,
    GitCleanupOptions as GitCleanupOptionsType,
    GitCleanupReportType as GitCleanupReportTypeType,
    GitCleanupSkippedBranchReport as GitCleanupSkippedBranchReportType,
    GitCleanupSummary as GitCleanupSummaryType,
    GitCleanupWorktreeInfo as GitCleanupWorktreeInfoType,
} from './git-cleanup.ts';
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
    buildGitCleanupReport,
    getGitCleanupUsage,
    parseGitCleanupArgs,
    renderGitCleanupOutput,
} from './git-cleanup.ts';
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
export type GitCleanupApplyResult = GitCleanupApplyResultType;
export type GitCleanupArchivePruneResult = GitCleanupArchivePruneResultType;
export type GitCleanupBranchBuckets = GitCleanupBranchBucketsType;
export type GitCleanupBranchReport = GitCleanupBranchReportType;
export type GitCleanupBranchState = GitCleanupBranchStateType;
export type GitCleanupDetachedWorktreeReport =
    GitCleanupDetachedWorktreeReportType;
export type GitCleanupDetachedWorktreeState =
    GitCleanupDetachedWorktreeStateType;
export type GitCleanupOptions = GitCleanupOptionsType;
export type GitCleanupReportType = GitCleanupReportTypeType;
export type GitCleanupSkippedBranchReport = GitCleanupSkippedBranchReportType;
export type GitCleanupSummary = GitCleanupSummaryType;
export type GitCleanupWorktreeInfo = GitCleanupWorktreeInfoType;
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
    buildGitCleanupReport,
    findBranchRuleset,
    getDefaultRulesetPath,
    getGitCleanupUsage,
    normalizeRuleset,
    parseGitCleanupArgs,
    pullRuleset,
    pushRuleset,
    readRulesetFile,
    renderGitCleanupOutput,
    writeRulesetFile,
};
