import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    cpSync,
    existsSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ApplyMode = 'apply' | 'audit' | 'prune';
type ArchivePruneScope = 'local' | 'remote';
type BaseDetectionSource = 'cli' | 'origin_live_head';
type BranchClassification = 'needs_review' | 'safe_delete';
type BranchReasonCode =
    | 'branch_checked_out_in_primary_worktree'
    | 'branch_reflog_has_unique_commits'
    | 'branch_reflog_unavailable'
    | 'branch_tip_not_on_base'
    | 'branch_tip_on_base'
    | 'detached_worktree_requires_manual_review'
    | 'linked_worktree_dirty'
    | 'linked_worktree_missing'
    | 'linked_worktree_prunable'
    | 'linked_worktrees_all_safe'
    | 'linked_worktrees_require_manual_review'
    | 'no_linked_worktrees'
    | 'origin_branch_absent'
    | 'origin_branch_checked_out_in_origin_worktree'
    | 'origin_branch_delete_target_mismatch'
    | 'origin_branch_history_not_on_base'
    | 'origin_branch_history_unverified'
    | 'origin_branch_identity_unverified'
    | 'origin_branch_live_probe_unverified'
    | 'origin_branch_live_tip_not_on_base'
    | 'origin_branch_live_tip_unverified'
    | 'origin_branch_non_origin_upstream'
    | 'origin_branch_protected_base'
    | 'origin_branch_tracking_ref_not_on_base'
    | 'repository_hidden_refs_present'
    | 'repository_hidden_refs_unavailable'
    | 'repository_linked_worktrees_present'
    | 'repository_reflog_has_unique_commits'
    | 'repository_reflog_unavailable'
    | 'repository_unreachable_commits_present'
    | 'repository_unreachable_commits_unavailable'
    | 'repository_worktree_dirty';
type DetachedWorktreeReasonCode =
    | 'detached_head_not_on_base'
    | 'detached_head_on_base'
    | 'detached_head_reflog_has_unique_commits'
    | 'detached_head_reflog_unavailable'
    | 'detached_worktree_clean'
    | 'detached_worktree_dirty'
    | 'detached_worktree_missing'
    | 'detached_worktree_prunable'
    | 'repository_hidden_refs_present'
    | 'repository_hidden_refs_unavailable'
    | 'repository_reflog_has_unique_commits'
    | 'repository_reflog_unavailable'
    | 'repository_unreachable_commits_present'
    | 'repository_unreachable_commits_unavailable'
    | 'repository_worktree_dirty';
type OpinionCode =
    | 'delete_after_switching_away'
    | 'delete'
    | 'keep_for_review'
    | 'needs_human_review'
    | 'probably_delete'
    | 'probably_keep';
type ProtectedBranchReasonCode = 'protected_branch';
type RemoteBranchStatus =
    | 'absent'
    | 'checked_out_in_origin_worktree'
    | 'history_not_on_base'
    | 'history_unverified'
    | 'identity_unverified'
    | 'live_probe_unverified'
    | 'live_tip_not_on_base'
    | 'live_tip_unverified'
    | 'non_origin_upstream'
    | 'protected_base'
    | 'safe'
    | 'tracking_ref_not_on_base';
type WorktreeState = 'clean' | 'dirty' | 'missing' | 'prunable';

type ApplyResult = {
    branch: string;
    errors: string[];
    localBackupRef: null | string;
    localBranchDeleted: boolean;
    localBranchSkippedReason: null | string;
    remoteBackupRef: null | string;
    remoteBranchDeleted: boolean;
    remoteBranchSkippedReason: null | string;
    removedWorktrees: string[];
    worktreeBackupPaths: string[];
};

type ArchivePruneCandidate = {
    branchName: string;
    ref: string;
    repoPath: string;
    scope: ArchivePruneScope;
};

type ArchivePruneListResult =
    | {
          candidates: ArchivePruneCandidate[];
          ok: true;
      }
    | {
          error: string;
          ok: false;
          repoPath: string;
          scope: ArchivePruneScope;
      };

type ArchivePruneResult = {
    archivedSha: null | string;
    errors: string[];
    pruned: boolean;
    ref: string;
    repoPath: string;
    scope: ArchivePruneScope;
    skippedReason: null | string;
};

type ApplyContext = {
    applyBase: BaseRef | null;
    applyBranchReport: BranchReport | null;
    localBranch: LocalDeleteResult | null;
    remoteBranch: null | RemoteDeleteResult;
    worktreeArchiveSummary: WorktreeArchiveSummary;
};

type ApplyBranchResults = {
    localBranch: LocalDeleteResult;
    remoteBranch: RemoteDeleteResult;
};

type BaseRef = {
    branchName: string;
    liveSha: string;
    localSha: string;
    ref: string;
    remoteUrl: string;
    shortName: string;
    source: BaseDetectionSource;
};

type BranchBuckets = {
    needsReview: BranchReport[];
    safeDelete: BranchReport[];
    skipped: SkippedBranchReport[];
};

type BranchAuditSnapshot = {
    base: BaseRef;
    report: BranchReport;
};

type BranchReport = {
    activity: string;
    classification: BranchClassification;
    deleteCommands: string[];
    linkedWorktrees: WorktreeInfo[];
    name: string;
    opinion: Opinion;
    reasonCodes: BranchReasonCode[];
    reasonDetails: string[];
    recentCommits: CommitInfo[];
    remoteBranch: null | RemoteBranchAssessment;
    state: BranchState;
};

type BranchState = {
    aheadCount: number;
    behindCount: number;
    branchReflogAvailable: boolean;
    branchReflogUniqueCommitCount: number;
    branchTipOnBase: boolean;
    hasBlockingDetachedWorktree: boolean;
    hasCommonAncestor: boolean;
    hasDirtyWorktree: boolean;
    hasMissingWorktree: boolean;
    hasPrimaryWorktree: boolean;
    hasPrunableWorktree: boolean;
    linkedWorktreeCount: number;
    mergedByHistory: boolean;
    originBranchStatus: RemoteBranchStatus;
    repositoryHiddenRefCount: number;
    repositoryHiddenRefs: string[];
    repositoryHiddenRefsAvailable: boolean;
    repositoryLinkedWorktreeCount: number;
    repositoryLinkedWorktreePaths: string[];
    repositoryReflogAvailable: boolean;
    repositoryReflogUniqueCommitCount: number;
    repositoryUnreachableCommitCount: number;
    repositoryUnreachableCommitsAvailable: boolean;
    repositoryWorktreeDirtyCount: number;
    repositoryWorktreeDirtyPaths: string[];
    safeToDelete: boolean;
    safetyProofFingerprint: null | string;
    uniqueCommitCount: number;
};

type CommitInfo = {
    author: string;
    dateIso: string;
    sha: string;
    shortSha: string;
    subject: string;
};

type DetachedWorktreeReport = {
    classification: 'needs_review';
    headCommit: CommitInfo;
    opinion: Opinion;
    path: string;
    reasonCodes: DetachedWorktreeReasonCode[];
    reasonDetails: string[];
    state: DetachedWorktreeState;
    statusLines: string[];
};

type DetachedWorktreeState = {
    headOnBase: boolean;
    headReflogAvailable: boolean;
    headReflogUniqueCommitCount: number;
    repositoryHiddenRefCount: number;
    repositoryHiddenRefs: string[];
    repositoryHiddenRefsAvailable: boolean;
    repositoryReflogAvailable: boolean;
    repositoryReflogUniqueCommitCount: number;
    repositoryUnreachableCommitCount: number;
    repositoryUnreachableCommitsAvailable: boolean;
    repositoryWorktreeDirtyCount: number;
    repositoryWorktreeDirtyPaths: string[];
    safeToRemoveManually: boolean;
    status: WorktreeState;
    statusLineCount: number;
};

type GitCleanupReport = {
    applyResults?: ApplyResult[];
    archivePruneResults?: ArchivePruneResult[];
    base: BaseRef;
    branches: BranchBuckets;
    detachedWorktrees: DetachedWorktreeReport[];
    generatedAt: string;
    mode: ApplyMode;
    repoRoot: string;
    summary: Summary;
};

type GitCleanupReportContext = {
    base: BaseRef;
    branches: BranchBuckets;
    detachedWorktrees: DetachedWorktreeReport[];
    repoRoot: string;
};

type FinalDetachedWorktreeReports = {
    baseIssue: null | string;
    detachedWorktrees: DetachedWorktreeReport[];
    repositoryIssue: null | string;
};

type CurrentDetachedWorktreeProof = {
    detachedWorktrees: DetachedWorktreeReport[];
    repositoryIssue: null | string;
};

type GitCommandFailure = {
    error: string;
    ok: false;
    stdout: string;
};

type GitCommandSuccess = {
    ok: true;
    stdout: string;
};

type GitDirectories = {
    absoluteGitDir: string;
    commonGitDir: string;
};

type GitCommandResult = GitCommandFailure | GitCommandSuccess;

type HiddenRefAnalysis = {
    available: boolean;
    fingerprint: null | string;
    refs: string[];
};

type LinkedWorktreeArchivePlan = {
    backupPath: string;
    commonGitDir: string;
    gitDir: string;
    sourceArchivePath: string;
};

type LocalTrackingRefProofStatus = Extract<
    RemoteBranchStatus,
    | 'history_unverified'
    | 'identity_unverified'
    | 'live_tip_unverified'
    | 'safe'
    | 'tracking_ref_not_on_base'
>;

type Opinion = {
    code: OpinionCode;
    label: string;
    reason: string;
};

type Options = {
    apply: boolean;
    base: null | string;
    json: boolean;
    keepArchives: boolean;
    pruneArchives: boolean;
};

type OriginHead = {
    branchName: string;
    liveSha: string;
};

type LiveOriginBranchAbsentProbe = {
    kind: 'absent';
};

type LiveOriginBranchPresentProbe = {
    kind: 'present';
    sha: string;
};

type LiveOriginBranchUnverifiedProbe = {
    error: string;
    kind: 'unverified';
};

type LiveOriginBranchProbe =
    | LiveOriginBranchAbsentProbe
    | LiveOriginBranchPresentProbe
    | LiveOriginBranchUnverifiedProbe;

type ParsedArgument = {
    nextIndex: number;
    option: Partial<Options>;
};

type ParsedReflog = {
    content: string;
    fingerprint: string;
    shas: string[];
};

type ProtectedArchiveRef =
    | {
          ref: string;
          sha: string;
      }
    | {
          ref: string;
          sha?: string;
          target: string;
      };

type ReflogAnalysis = {
    available: boolean;
    fingerprint: null | string;
    uniqueCommitCount: number;
};

type RepositoryUnreachableCommitAnalysis = {
    available: boolean;
    commitCount: number;
    fingerprint: null | string;
};

type RemoteBranchAssessment = {
    branch: string;
    liveSha: null | string;
    localTrackingProofFingerprint: null | string;
    localTrackingSha: null | string;
    remote: string;
    remoteSafetyProofFingerprint: null | string;
    shortName: string;
    status: RemoteBranchStatus;
};

type UpstreamInfo = {
    branch: string;
    remote: string;
    shortName: string;
};

type RemoteBranchReflogProof = {
    fingerprint: null | string;
    status: Extract<
        RemoteBranchStatus,
        'history_not_on_base' | 'history_unverified' | 'safe'
    >;
};

type RemoteDeleteResult = {
    archivedSha?: null | string;
    backupRef: null | string;
    backupReflogPrefix?: null | string;
    backupRepoPath?: null | string;
    deleted: boolean;
    errors: string[];
    safeWithoutDelete?: boolean;
    skippedReason: null | string;
};

type RecordedRemoteArchive = {
    archivedSha: string;
    backupRef: string;
    backupReflogPrefix: string;
    backupRepoPath: string;
};

type HostedRemoteDeleteBaseValidation =
    | {
          base: BaseRef;
          status: 'ready';
      }
    | {
          result: RemoteDeleteResult;
          status: 'blocked';
      };

type HostedRemoteDeleteValidation =
    | {
          liveBranchProbe: Extract<LiveOriginBranchProbe, { kind: 'present' }>;
          liveSha: string;
          status: 'ready';
      }
    | {
          result: RemoteDeleteResult;
          status: 'blocked';
      };

type WorktreeArchiveSummary = {
    errors: string[];
    removedWorktrees: string[];
    worktreeBackupPaths: string[];
};

type GitDirectoryEntry = {
    isDirectory: () => boolean;
    isFile: () => boolean;
    name: string;
};
type GitDirectoryEntryReadResult =
    | {
          entries: GitDirectoryEntry[];
          ok: true;
      }
    | {
          error: string;
          ok: false;
      };

type LocalDeleteResult = {
    archivedSha: null | string;
    backupRef: null | string;
    backupReflogPrefix?: null | string;
    deleted: boolean;
    errors: string[];
    skippedReason: null | string;
};

type SkippedBranchReport = {
    classification: 'skipped';
    name: string;
    reasonCodes: readonly [ProtectedBranchReasonCode];
    reasonDetails: string[];
    ref: string;
};

type Summary = {
    detachedWorktrees: number;
    needsReviewBranches: number;
    safeDeleteBranches: number;
    skippedBranches: number;
};

type WorktreeInfo = {
    bare: boolean;
    branchName: null | string;
    headSha: string;
    isPrimary: boolean;
    locked: boolean;
    path: string;
    prunable: boolean;
    state: WorktreeState;
    statusLines: string[];
};

type WorktreeRemovalResult = {
    backupPath: null | string;
    path: string;
    result: GitCommandResult;
};

type WorktreeSeed = {
    bare: boolean;
    branchName: null | string;
    headSha: string;
    isPrimary: boolean;
    locked: boolean;
    path: string;
    prunable: boolean;
};

export type GitCleanupOptions = Options;
export type GitCleanupApplyResult = ApplyResult;
export type GitCleanupArchivePruneResult = ArchivePruneResult;
export type GitCleanupBranchBuckets = BranchBuckets;
export type GitCleanupBranchReport = BranchReport;
export type GitCleanupBranchState = BranchState;
export type GitCleanupDetachedWorktreeReport = DetachedWorktreeReport;
export type GitCleanupDetachedWorktreeState = DetachedWorktreeState;
export type GitCleanupReportType = GitCleanupReport;
export type GitCleanupSkippedBranchReport = SkippedBranchReport;
export type GitCleanupSummary = Summary;
export type GitCleanupWorktreeInfo = WorktreeInfo;

const BACKUP_SUFFIX_LENGTH = 8;
const COMMIT_FORMAT = '%H%x1f%cI%x1f%an%x1f%s';
const GIT_ADMIN_DIRECTORIES = ['rebase-apply', 'rebase-merge', 'sequencer'];
const GIT_ADMIN_FILES = [
    'AUTO_MERGE',
    'MERGE_HEAD',
    'MERGE_AUTOSTASH',
    'MERGE_MODE',
    'MERGE_MSG',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'BISECT_LOG',
    'BISECT_START',
    'REBASE_HEAD',
    'SQUASH_MSG',
];
const GIT_CLEANUP_ARCHIVE_BRANCH_PREFIX = 'slop-refinery/archive';
const PROTECTED_BRANCH_REASON_CODES = ['protected_branch'] as const;
const TEMP_BRANCH_PATTERN =
    /(?:^|[/_-])(demo|experiment|playground|proof|scratch|spike|temp|test|tmp|wip)(?:$|[/_-])/i;
const ARCHIVE_BRANCH_REF_TRANSACTION_SCRIPT = String.raw`
const { execFileSync, spawn } = require('node:child_process');
const { dirname, join } = require('node:path');
const {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} = require('node:fs');

const [repoPath, originalBranchName, archivedBranchName, expectedBranchSha] =
    process.argv.slice(1, 5);
const protectedRefsJson = process.argv[5] ?? '[]';
const expectedSourceReflogPath = process.argv[6] ?? '';
const expectedSourceReflog =
    expectedSourceReflogPath === ''
        ? null
        : readFileSync(expectedSourceReflogPath);

let protectedRefs = [];

try {
    protectedRefs = JSON.parse(protectedRefsJson);
} catch {
    protectedRefs = [];
}

function writeResult(result) {
    process.stdout.write(JSON.stringify(result) + '\n');
}

function git(args) {
    return execFileSync('git', args, {
        cwd: repoPath,
        encoding: 'utf8',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function gitSucceeded(args) {
    try {
        git(args);
        return true;
    } catch {
        return false;
    }
}

function readCommitSha(ref) {
    try {
        return git(['rev-parse', '--verify', ref + '^{commit}']);
    } catch {
        return null;
    }
}

function isSymbolicRef(ref) {
    return gitSucceeded(['symbolic-ref', '-q', '--no-recurse', ref]);
}

function isBranchCheckedOut(branchName) {
    const targetBranch = 'branch refs/heads/' + branchName;
    const output = execFileSync(
        'git',
        ['worktree', 'list', '--porcelain', '-z'],
        {
            cwd: repoPath,
            encoding: 'utf8',
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );

    return output.split('\0').some((field) => field === targetBranch);
}

function readReflogPath(branchName) {
    return join(
        git(['rev-parse', '--path-format=absolute', '--git-common-dir']),
        'logs',
        'refs',
        'heads',
        ...branchName.split('/'),
    );
}

const refLockMarker =
    'slop-refinery archive protected ref lock ' + process.pid + '\n';
const heldRefLocks = [];

function readGitPath(pathspec) {
    return git(['rev-parse', '--path-format=absolute', '--git-path', pathspec]);
}

function acquireProtectedRefLock(ref) {
    const lockPath = readGitPath(ref) + '.lock';

    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, refLockMarker, { flag: 'wx' });
    heldRefLocks.push(lockPath);
}

function releaseHeldRefLocks() {
    while (heldRefLocks.length > 0) {
        const lockPath = heldRefLocks.pop();

        try {
            if (readFileSync(lockPath, 'utf8') === refLockMarker) {
                rmSync(lockPath, { force: true });
            }
        } catch {
            // Another process changed or removed the lock; fail closed elsewhere.
        }
    }
}

async function archiveBranch() {
    const sourceRef = 'refs/heads/' + originalBranchName;
    const archiveRef = 'refs/heads/' + archivedBranchName;
    const sourceReflogPath = readReflogPath(originalBranchName);
    const archiveReflogPath = readReflogPath(archivedBranchName);
    const normalizedProtectedRefs = Array.isArray(protectedRefs)
        ? protectedRefs.filter(
              (protectedRef) =>
                  protectedRef &&
                  typeof protectedRef.ref === 'string',
          )
        : [];
    const protectedRefCommands = normalizedProtectedRefs.flatMap(
        (protectedRef) => {
            if (typeof protectedRef.target === 'string') {
                return [
                    'symref-verify ' +
                        protectedRef.ref +
                        ' ' +
                        protectedRef.target,
                ];
            }

            if (typeof protectedRef.sha === 'string') {
                return ['verify ' + protectedRef.ref + ' ' + protectedRef.sha];
            }

            return [];
        },
    );

    if (isSymbolicRef(sourceRef)) {
        return {
            error: 'source branch ' + sourceRef + ' is symbolic and cannot be archived automatically.',
            ok: false,
        };
    }

    if (isSymbolicRef(archiveRef)) {
        return {
            error: 'archive branch ' + archiveRef + ' is symbolic and cannot be used automatically.',
            ok: false,
        };
    }

    if (!existsSync(sourceReflogPath)) {
        return {
            error: 'source branch ' + sourceRef + ' is missing its reflog.',
            ok: false,
        };
    }

    if (existsSync(archiveReflogPath)) {
        return {
            error: 'archive branch ' + archiveRef + ' already has a reflog.',
            ok: false,
        };
    }

    let copiedReflog = null;

    return new Promise((resolve) => {
        const child = spawn('git', ['update-ref', '--no-deref', '--stdin'], {
            cwd: repoPath,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let prepared = false;
        let copyError = null;

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');

            if (!prepared && stdout.includes('prepare: ok\n')) {
                prepared = true;

                try {
                    if (isSymbolicRef(sourceRef)) {
                        throw new Error(
                            'source branch ' + sourceRef + ' became symbolic during archive.',
                        );
                    }

                    if (isSymbolicRef(archiveRef)) {
                        throw new Error(
                            'archive branch ' + archiveRef + ' became symbolic during archive.',
                        );
                    }

                    if (isBranchCheckedOut(originalBranchName)) {
                        throw new Error(
                            'source branch ' + sourceRef + ' became checked out during archive.',
                        );
                    }

                    for (const protectedRef of normalizedProtectedRefs) {
                        if (
                            typeof protectedRef.target === 'string' &&
                            typeof protectedRef.sha === 'string'
                        ) {
                            acquireProtectedRefLock(protectedRef.target);
                        }

                        if (typeof protectedRef.target === 'string') {
                            const currentTarget = git([
                                'symbolic-ref',
                                '-q',
                                '--no-recurse',
                                protectedRef.ref,
                            ]);

                            if (currentTarget !== protectedRef.target) {
                                throw new Error(
                                    'protected ref ' +
                                        protectedRef.ref +
                                        ' no longer targets ' +
                                        protectedRef.target +
                                        '.',
                                );
                            }

                            if (isSymbolicRef(protectedRef.target)) {
                                throw new Error(
                                    'protected target ref ' +
                                        protectedRef.target +
                                        ' became symbolic during archive.',
                                );
                            }
                        }

                        if (typeof protectedRef.sha === 'string') {
                            const currentSha = readCommitSha(
                                typeof protectedRef.target === 'string'
                                    ? protectedRef.target
                                    : protectedRef.ref,
                            );

                            if (currentSha !== protectedRef.sha) {
                                throw new Error(
                                    'protected ref ' +
                                        protectedRef.ref +
                                        ' no longer resolves to ' +
                                        protectedRef.sha.slice(0, 7) +
                                        '.',
                                );
                            }
                        }
                    }

                    const sourceReflog = readFileSync(sourceReflogPath);

                    if (
                        expectedSourceReflog !== null &&
                        !sourceReflog.equals(expectedSourceReflog)
                    ) {
                        throw new Error(
                            'source branch ' + sourceRef + ' reflog changed during archive.',
                        );
                    }

                    if (sourceReflog.toString('latin1').trim() === '') {
                        throw new Error(
                            'source branch ' + sourceRef + ' has an empty reflog.',
                        );
                    }

                    mkdirSync(dirname(archiveReflogPath), {
                        recursive: true,
                    });
                    writeFileSync(archiveReflogPath, sourceReflog, {
                        flag: 'wx',
                    });
                    copiedReflog = sourceReflog;
                    child.stdin.write('commit\n');
                } catch (error) {
                    copyError =
                        error instanceof Error ? error.message : String(error);
                    child.stdin.write('abort\n');
                }

                child.stdin.end();
            }
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (error) => {
            releaseHeldRefLocks();
            resolve({
                error: error instanceof Error ? error.message : String(error),
                ok: false,
            });
        });

        child.on('close', (code) => {
            releaseHeldRefLocks();

            if (copyError !== null) {
                removeCopiedArchiveReflog();
                resolve({ error: copyError, ok: false });
                return;
            }

            if (code === 0 && stdout.includes('commit: ok\n')) {
                resolve({ ok: true });
                return;
            }

            removeCopiedArchiveReflog();
            resolve({
                error:
                    stderr.trim() ||
                    stdout.trim() ||
                    'git update-ref exited with status ' + (code ?? 'unknown') + '.',
                ok: false,
            });
        });

        child.stdin.write(
            [
                'start',
                ...protectedRefCommands,
                'create ' + archiveRef + ' ' + expectedBranchSha,
                'delete ' + sourceRef + ' ' + expectedBranchSha,
                'prepare',
                '',
            ].join('\n'),
        );
    });

    function removeCopiedArchiveReflog() {
        if (copiedReflog === null) {
            return;
        }

        try {
            if (readFileSync(archiveReflogPath).equals(copiedReflog)) {
                rmSync(archiveReflogPath, { force: true });
            }
        } catch {
            // If another process changed the reflog, leave it for manual review.
        }
    }
}

archiveBranch()
    .then(writeResult)
    .catch((error) => {
        writeResult({
            error: error instanceof Error ? error.message : String(error),
            ok: false,
        });
    });
`;
const RESTORE_BRANCH_REF_TRANSACTION_SCRIPT = String.raw`
const { execFileSync, spawn } = require('node:child_process');
const { dirname, join } = require('node:path');
const {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} = require('node:fs');

const [
    repoPath,
    originalBranchName,
    targetBranchSha,
    expectedReflogPath = '',
] = process.argv.slice(1, 5);
const expectedReflog =
    expectedReflogPath === ''
        ? null
        : readFileSync(expectedReflogPath);

function writeResult(result) {
    process.stdout.write(JSON.stringify(result) + '\n');
}

function git(args) {
    return execFileSync('git', args, {
        cwd: repoPath,
        encoding: 'utf8',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function gitSucceeded(args) {
    try {
        git(args);
        return true;
    } catch {
        return false;
    }
}

function readReflogPath(branchName) {
    return join(
        git(['rev-parse', '--path-format=absolute', '--git-common-dir']),
        'logs',
        'refs',
        'heads',
        ...branchName.split('/'),
    );
}

async function restoreBranch() {
    const targetRef = 'refs/heads/' + originalBranchName;
    const reflogPath = readReflogPath(originalBranchName);
    let wroteExpectedReflog = false;

    if (!gitSucceeded(['cat-file', '-e', targetBranchSha + '^{commit}'])) {
        return {
            error:
                'commit ' +
                targetBranchSha.slice(0, 7) +
                ' is no longer available.',
            ok: false,
        };
    }

    if (expectedReflog !== null && expectedReflog.toString('latin1').trim() === '') {
        return {
            error: 'expected restored branch reflog content is empty.',
            ok: false,
        };
    }

    if (expectedReflog !== null && existsSync(reflogPath)) {
        return {
            error:
                'restored branch ' +
                targetRef +
                ' already has a reflog before restoration.',
            ok: false,
        };
    }

    return new Promise((resolve) => {
        const child = spawn(
            'git',
            ['update-ref', '--no-deref', '--create-reflog', '--stdin'],
            {
                cwd: repoPath,
                env: process.env,
                stdio: ['pipe', 'pipe', 'pipe'],
            },
        );
        let stdout = '';
        let stderr = '';
        let prepared = false;
        let reflogError = null;

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');

            if (!prepared && stdout.includes('prepare: ok\n')) {
                prepared = true;

                try {
                    if (expectedReflog !== null) {
                        mkdirSync(dirname(reflogPath), { recursive: true });
                        writeFileSync(reflogPath, expectedReflog, {
                            flag: 'wx',
                        });
                        wroteExpectedReflog = true;
                    }

                    child.stdin.write('commit\n');
                } catch (error) {
                    reflogError =
                        error instanceof Error ? error.message : String(error);
                    child.stdin.write('abort\n');
                }

                child.stdin.end();
            }
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (error) => {
            resolve({
                error: error instanceof Error ? error.message : String(error),
                ok: false,
            });
        });

        child.on('close', (code) => {
            if (reflogError !== null) {
                removeExpectedReflog();
                resolve({ error: reflogError, ok: false });
                return;
            }

            if (code === 0 && stdout.includes('commit: ok\n')) {
                resolve({ ok: true });
                return;
            }

            if (expectedReflog !== null) {
                removeExpectedReflog();
            }

            resolve({
                error:
                    stderr.trim() ||
                    stdout.trim() ||
                    'git update-ref exited with status ' + (code ?? 'unknown') + '.',
                ok: false,
            });
        });

        child.stdin.write(
            [
                'start',
                'create ' + targetRef + ' ' + targetBranchSha,
                'prepare',
                '',
            ].join('\n'),
        );
    });

    function removeExpectedReflog() {
        if (!wroteExpectedReflog || expectedReflog === null) {
            return;
        }

        try {
            if (readFileSync(reflogPath).equals(expectedReflog)) {
                rmSync(reflogPath, { force: true });
            }
        } catch {
            // If another process changed the reflog, leave it for manual review.
        }
    }
}

restoreBranch()
    .then(writeResult)
    .catch((error) => {
        writeResult({
            error: error instanceof Error ? error.message : String(error),
            ok: false,
        });
    });
`;
const GIT_PROOF_ENVIRONMENT_VARIABLES_TO_REMOVE: ReadonlySet<string> = new Set([
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_CONFIG',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_NOSYSTEM',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_SYSTEM',
    'GIT_DIR',
    'GIT_GRAFT_FILE',
    'GIT_INDEX_FILE',
    'GIT_NAMESPACE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_QUARANTINE_PATH',
    'GIT_REPLACE_REF_BASE',
    'GIT_WORK_TREE',
] as const);

const GIT_PROOF_ENVIRONMENT_PREFIXES_TO_REMOVE = [
    'GIT_CONFIG_KEY_',
    'GIT_CONFIG_VALUE_',
] as const;

const GIT_DISABLED_REWRITE_ENV: NodeJS.ProcessEnv =
    buildGitDisabledRewriteEnv();

function buildGitDisabledRewriteEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    for (const key of Object.keys(env)) {
        if (isGitProofEnvironmentVariable(key)) {
            delete env[key];
        }
    }

    env.GIT_GRAFT_FILE = devNull;
    env.GIT_NO_REPLACE_OBJECTS = '1';

    return env;
}

function isGitProofEnvironmentVariable(key: string): boolean {
    return (
        GIT_PROOF_ENVIRONMENT_VARIABLES_TO_REMOVE.has(key) ||
        GIT_PROOF_ENVIRONMENT_PREFIXES_TO_REMOVE.some((prefix) =>
            key.startsWith(prefix),
        )
    );
}

function stableHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function stableHashByteString(value: string): string {
    return createHash('sha256')
        .update(Buffer.from(value, 'latin1'))
        .digest('hex');
}

export function getGitCleanupUsage(): string {
    return [
        'Usage:',
        '  slop-refinery git-cleanup [--apply] [--prune-archives] [--keep-archives] [--base ref] [--json]',
        '',
        'Safety model:',
        '  origin must exist and its live default branch is the only canonical base.',
        '  Automatic cleanup only removes branch names whose current local and origin tips are already preserved on that base.',
        '  Local branches are archived into tool-managed refs before their active branch names are removed, so branch reflogs stay preserved.',
        '  Hosted origin branches are deleted with a force-with-lease guard after their live SHA is revalidated.',
        '  Successful --apply runs prune redundant tool-managed archive refs unless --keep-archives is set.',
        '  Archive pruning only removes refs whose tip and reflog history are already preserved on the canonical base.',
        '  Linked worktrees always require manual review.',
        '',
        'Options:',
        '  --apply          Delete only items proven safe for automatic local cleanup, then prune safe archives.',
        '  --prune-archives Delete redundant tool-managed archive refs after fail-closed validation.',
        '  --keep-archives  Keep archive refs after --apply; explicit --prune-archives still prunes.',
        "  --base           Assert the canonical base ref explicitly; it must resolve to origin's live default branch.",
        '  --json           Emit machine-readable output.',
        '  --help           Show this message.',
    ].join('\n');
}

export function parseGitCleanupArgs(
    args: readonly string[],
): GitCleanupOptions {
    return parseArgs(args);
}

export function buildGitCleanupReport(
    options: GitCleanupOptions,
): GitCleanupReport {
    return buildReport(options);
}

export function renderGitCleanupOutput(
    report: GitCleanupReport,
    json: boolean,
): string {
    return renderOutput(report, json);
}

function parseArgs(args: readonly string[]): Options {
    return parseArgsFromIndex(args, 0, {
        apply: false,
        base: null,
        json: false,
        keepArchives: false,
        pruneArchives: false,
    });
}

function parseArgsFromIndex(
    args: readonly string[],
    index: number,
    options: Options,
): Options {
    if (index >= args.length) {
        return options;
    }

    const parsed = parseArgument(args, index);

    return parseArgsFromIndex(args, parsed.nextIndex + 1, {
        ...options,
        ...parsed.option,
    });
}

function parseArgument(args: readonly string[], index: number): ParsedArgument {
    const arg = args[index];

    if (arg === '--apply') {
        return {
            nextIndex: index,
            option: { apply: true },
        };
    }

    if (arg === '--json') {
        return {
            nextIndex: index,
            option: { json: true },
        };
    }

    if (arg === '--prune-archives') {
        return {
            nextIndex: index,
            option: { pruneArchives: true },
        };
    }

    if (arg === '--keep-archives') {
        return {
            nextIndex: index,
            option: { keepArchives: true },
        };
    }

    if (arg === '--base') {
        return readBaseArgument(args, index);
    }

    throw new Error(`Unknown argument: ${arg}`);
}

function readBaseArgument(
    args: readonly string[],
    index: number,
): ParsedArgument {
    const value = args[index + 1];

    if (value === undefined) {
        throw new Error('Expected a ref after --base.');
    }

    return {
        nextIndex: index + 1,
        option: { base: value },
    };
}

function buildReport(options: Options): GitCleanupReport {
    const context = buildReportContext(options);
    const report = buildAuditReport(context);
    const appliedReport = options.apply
        ? applyReportSafeDeletes(report, context)
        : report;

    return shouldPruneArchives(options, appliedReport)
        ? pruneReportArchives(appliedReport, context)
        : appliedReport;
}

function shouldPruneArchives(
    options: Options,
    report: GitCleanupReport,
): boolean {
    return (
        options.pruneArchives ||
        (options.apply && !options.keepArchives && applySucceeded(report))
    );
}

function applySucceeded(report: GitCleanupReport): boolean {
    return (
        report.applyResults !== undefined &&
        report.applyResults.length > 0 &&
        report.applyResults.every((result) => applyResultSucceeded(result))
    );
}

function applyResultSucceeded(result: ApplyResult): boolean {
    return (
        result.errors.length === 0 &&
        result.localBranchDeleted &&
        remoteApplyResultSucceeded(result)
    );
}

function remoteApplyResultSucceeded(result: ApplyResult): boolean {
    return (
        result.remoteBranchDeleted ||
        result.remoteBranchSkippedReason === null ||
        result.remoteBranchSkippedReason.includes(
            'already absent and its remote history was revalidated as safe',
        )
    );
}

function buildReportContext(options: Options): GitCleanupReportContext {
    const repoRoot = readGit(process.cwd(), ['rev-parse', '--show-toplevel']);
    assertNoHistoryRewriteOverlays(repoRoot);
    const base = detectBaseRef(repoRoot, options.base);
    const localBranches = listBranches(repoRoot);
    const worktrees = listWorktrees(repoRoot);
    const unreachableCommitAnalysis =
        readRepositoryUnreachableCommitAnalysis(repoRoot);
    const repositoryReflogAnalysis = readRepositoryReflogAnalysis(
        repoRoot,
        base.liveSha,
    );
    const hiddenRefAnalysis = readReachableHiddenRefAnalysis(
        repoRoot,
        base.liveSha,
    );
    const detachedWorktrees = buildDetachedWorktreeReports(
        repoRoot,
        base,
        worktrees,
        hiddenRefAnalysis,
        repositoryReflogAnalysis,
        unreachableCommitAnalysis,
    );
    const initialBranches = buildBranchBuckets(
        repoRoot,
        base,
        localBranches,
        worktrees,
        detachedWorktrees,
        hiddenRefAnalysis,
        repositoryReflogAnalysis,
        unreachableCommitAnalysis,
    );
    const finalBaseIssue = readLiveBaseValidationIssue(repoRoot, base);
    const revalidatedBranches =
        finalBaseIssue === null
            ? revalidateSafeDeleteBranchProofs(repoRoot, base, initialBranches)
            : failClosedSafeDeleteBranches(initialBranches, finalBaseIssue);
    const finalDetachedWorktreeReports = readFinalDetachedWorktreeReports(
        repoRoot,
        base,
        detachedWorktrees,
        finalBaseIssue,
    );
    const branches = reconcileBranchesWithFinalProof(
        revalidatedBranches,
        finalDetachedWorktreeReports,
    );

    return {
        base,
        branches,
        detachedWorktrees: finalDetachedWorktreeReports.detachedWorktrees,
        repoRoot,
    };
}

function reconcileBranchesWithFinalProof(
    branches: BranchBuckets,
    finalDetachedWorktreeReports: FinalDetachedWorktreeReports,
): BranchBuckets {
    const finalProofIssue = finalDetachedWorktreeReports.baseIssue;

    return finalProofIssue === null
        ? branches
        : failClosedSafeDeleteBranches(branches, finalProofIssue);
}

function readFinalDetachedWorktreeReports(
    repoRoot: string,
    base: BaseRef,
    initialDetachedWorktrees: readonly DetachedWorktreeReport[],
    priorBaseIssue: null | string,
): FinalDetachedWorktreeReports {
    if (priorBaseIssue !== null) {
        return {
            baseIssue: priorBaseIssue,
            detachedWorktrees: failClosedDetachedWorktrees(
                initialDetachedWorktrees,
                priorBaseIssue,
            ),
            repositoryIssue: priorBaseIssue,
        };
    }

    const currentProof = readCurrentDetachedWorktreeProof(repoRoot, base);
    const finalBaseIssue = readLiveBaseValidationIssue(repoRoot, base);
    const finalProofIssue = finalBaseIssue ?? currentProof.repositoryIssue;

    return {
        baseIssue: finalBaseIssue,
        detachedWorktrees:
            finalProofIssue === null
                ? currentProof.detachedWorktrees
                : failClosedDetachedWorktrees(
                      currentProof.detachedWorktrees,
                      finalProofIssue,
                  ),
        repositoryIssue: currentProof.repositoryIssue,
    };
}

function readCurrentDetachedWorktreeReports(
    repoRoot: string,
    base: BaseRef,
): DetachedWorktreeReport[] {
    return readCurrentDetachedWorktreeProof(repoRoot, base).detachedWorktrees;
}

function readCurrentDetachedWorktreeProof(
    repoRoot: string,
    base: BaseRef,
): CurrentDetachedWorktreeProof {
    const worktrees = listWorktrees(repoRoot);
    const unreachableCommitAnalysis =
        readRepositoryUnreachableCommitAnalysis(repoRoot);
    const repositoryReflogAnalysis = readRepositoryReflogAnalysis(
        repoRoot,
        base.liveSha,
    );
    const hiddenRefAnalysis = readReachableHiddenRefAnalysis(
        repoRoot,
        base.liveSha,
    );

    return {
        detachedWorktrees: buildDetachedWorktreeReports(
            repoRoot,
            base,
            worktrees,
            hiddenRefAnalysis,
            repositoryReflogAnalysis,
            unreachableCommitAnalysis,
        ),
        repositoryIssue: readRepositoryStateRevalidationIssue(
            repoRoot,
            worktrees,
            hiddenRefAnalysis,
            repositoryReflogAnalysis,
            unreachableCommitAnalysis,
        ),
    };
}

function readRepositoryStateRevalidationIssue(
    repoRoot: string,
    worktrees: readonly WorktreeInfo[],
    hiddenRefAnalysis: HiddenRefAnalysis,
    repositoryReflogAnalysis: ReflogAnalysis,
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
): null | string {
    const rewriteOverlayIssue = readHistoryRewriteOverlayIssue(repoRoot);

    if (rewriteOverlayIssue !== null) {
        return `${rewriteOverlayIssue} The final report proof recheck fails closed because rewrite overlays can falsify ancestry.`;
    }

    const linkedWorktreeCount =
        readRepositoryLinkedWorktreePaths(worktrees).length;

    if (linkedWorktreeCount > 0) {
        return `the repository gained ${linkedWorktreeCount} linked worktree(s) during the final report proof recheck.`;
    }

    const dirtyWorktreeCount = readRepositoryDirtyWorktrees(worktrees).length;

    if (dirtyWorktreeCount > 0) {
        return `the repository gained ${dirtyWorktreeCount} dirty, missing, or prunable worktree(s) during the final report proof recheck.`;
    }

    return (
        readHiddenRefRevalidationIssue(hiddenRefAnalysis) ??
        readReflogRevalidationIssue(repositoryReflogAnalysis) ??
        readUnreachableObjectRevalidationIssue(unreachableCommitAnalysis)
    );
}

function readHiddenRefRevalidationIssue(
    hiddenRefAnalysis: HiddenRefAnalysis,
): null | string {
    if (!hiddenRefAnalysis.available) {
        return 'the repository-wide hidden-ref scan could not be revalidated during the final report proof recheck.';
    }

    return hiddenRefAnalysis.refs.length > 0
        ? `the repository gained ${hiddenRefAnalysis.refs.length} reachable ref(s) outside the canonical base during the final report proof recheck.`
        : null;
}

function readReflogRevalidationIssue(
    repositoryReflogAnalysis: ReflogAnalysis,
): null | string {
    if (!repositoryReflogAnalysis.available) {
        return 'the repository-wide reflog scan could not be revalidated during the final report proof recheck.';
    }

    return repositoryReflogAnalysis.uniqueCommitCount > 0
        ? `the repository reflogs retained ${repositoryReflogAnalysis.uniqueCommitCount} commit(s) outside the canonical base during the final report proof recheck.`
        : null;
}

function readUnreachableObjectRevalidationIssue(
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
): null | string {
    if (!unreachableCommitAnalysis.available) {
        return 'the repository-wide unreachable-object scan could not be revalidated during the final report proof recheck.';
    }

    return unreachableCommitAnalysis.commitCount > 0
        ? `the repository gained ${unreachableCommitAnalysis.commitCount} unreachable object(s) during the final report proof recheck.`
        : null;
}

function failClosedDetachedWorktrees(
    detachedWorktrees: readonly DetachedWorktreeReport[],
    reason: string,
): DetachedWorktreeReport[] {
    return detachedWorktrees.map((worktree) =>
        failClosedDetachedWorktree(worktree, reason),
    );
}

function failClosedDetachedWorktree(
    worktree: DetachedWorktreeReport,
    reason: string,
): DetachedWorktreeReport {
    const state = {
        ...worktree.state,
        safeToRemoveManually: false,
    };

    return {
        ...worktree,
        opinion: decideDetachedWorktreeOpinion('origin default branch', state),
        reasonDetails: [
            ...worktree.reasonDetails,
            `detached worktree safety proof became stale: ${reason}`,
        ],
        state,
    };
}

function buildAuditReport(context: GitCleanupReportContext): GitCleanupReport {
    return {
        base: context.base,
        branches: context.branches,
        detachedWorktrees: context.detachedWorktrees,
        generatedAt: new Date().toISOString(),
        mode: 'audit',
        repoRoot: context.repoRoot,
        summary: buildSummary(context.branches, context.detachedWorktrees),
    };
}

function applyReportSafeDeletes(
    report: GitCleanupReport,
    context: GitCleanupReportContext,
): GitCleanupReport {
    const applyResults = applySafeDeletes(
        context.repoRoot,
        context.base,
        context.branches.safeDelete,
    );
    const branches = reconcileApplyReportBranches(
        context.repoRoot,
        context.base,
        report.branches,
        applyResults,
    );

    return {
        ...report,
        applyResults,
        branches,
        mode: 'apply',
        summary: buildSummary(branches, context.detachedWorktrees),
    };
}

function pruneReportArchives(
    report: GitCleanupReport,
    context: GitCleanupReportContext,
): GitCleanupReport {
    return {
        ...report,
        archivePruneResults: pruneArchiveRefs(context.repoRoot, context.base),
        mode: report.mode === 'apply' ? 'apply' : 'prune',
    };
}

function pruneArchiveRefs(
    repoRoot: string,
    base: BaseRef,
): ArchivePruneResult[] {
    return readArchivePruneCandidates(repoRoot, base).flatMap((candidate) =>
        candidate.ok
            ? candidate.candidates.map((archiveRef) =>
                  pruneArchiveRef(repoRoot, base, archiveRef),
              )
            : [buildArchivePruneListFailure(candidate)],
    );
}

function readArchivePruneCandidates(
    repoRoot: string,
    base: BaseRef,
): ArchivePruneListResult[] {
    return [
        listArchivePruneCandidates(repoRoot, 'local'),
        ...readRemoteArchivePruneCandidates(repoRoot, base),
    ];
}

function readRemoteArchivePruneCandidates(
    repoRoot: string,
    base: BaseRef,
): ArchivePruneListResult[] {
    const remoteRepoPath = resolveLocalGitRemotePath(repoRoot, base.remoteUrl);

    return remoteRepoPath === null
        ? []
        : [listArchivePruneCandidates(remoteRepoPath, 'remote')];
}

function listArchivePruneCandidates(
    repoPath: string,
    scope: ArchivePruneScope,
): ArchivePruneListResult {
    const refs = tryGit(repoPath, [
        'for-each-ref',
        readArchivePruneRefPrefix(scope),
        '--format=%(refname)',
    ]);

    if (!refs.ok) {
        return { error: refs.error, ok: false, repoPath, scope };
    }

    return {
        candidates:
            refs.stdout === ''
                ? []
                : readArchivePruneRefs(refs, repoPath, scope),
        ok: true,
    };
}

function readArchivePruneRefs(
    refs: GitCommandSuccess,
    repoPath: string,
    scope: ArchivePruneScope,
): ArchivePruneCandidate[] {
    return refs.stdout.split('\n').map((ref) => ({
        branchName: ref.replace(/^refs\/heads\//u, ''),
        ref,
        repoPath,
        scope,
    }));
}

function readArchivePruneRefPrefix(scope: ArchivePruneScope): string {
    return `refs/heads/${GIT_CLEANUP_ARCHIVE_BRANCH_PREFIX}/${scope}`;
}

function buildArchivePruneListFailure(
    failure: Extract<ArchivePruneListResult, { ok: false }>,
): ArchivePruneResult {
    return {
        archivedSha: null,
        errors: [failure.error],
        pruned: false,
        ref: readArchivePruneRefPrefix(failure.scope),
        repoPath: failure.repoPath,
        scope: failure.scope,
        skippedReason: 'archive refs could not be listed.',
    };
}

function pruneArchiveRef(
    repoRoot: string,
    base: BaseRef,
    archiveRef: ArchivePruneCandidate,
): ArchivePruneResult {
    const archivedSha = readRefCommitSha(archiveRef.repoPath, archiveRef.ref);
    const issue = readArchivePruneIssue(
        repoRoot,
        base,
        archiveRef,
        archivedSha,
    );

    if (issue !== null) {
        return buildSkippedArchivePruneResult(archiveRef, archivedSha, issue);
    }

    return archivedSha === null
        ? buildSkippedArchivePruneResult(
              archiveRef,
              archivedSha,
              'archive ref no longer resolves to a commit.',
          )
        : deleteArchiveRef(archiveRef, archivedSha);
}

function readArchivePruneIssue(
    repoRoot: string,
    base: BaseRef,
    archiveRef: ArchivePruneCandidate,
    archivedSha: null | string,
): null | string {
    return (
        readArchivePruneBaseIssue(repoRoot, base, archiveRef) ??
        readArchiveRefSafetyIssue(archiveRef, base.liveSha, archivedSha)
    );
}

function readArchivePruneBaseIssue(
    repoRoot: string,
    base: BaseRef,
    archiveRef: ArchivePruneCandidate,
): null | string {
    const localBaseIssue = readLiveBaseValidationIssue(repoRoot, base);

    return archiveRef.scope === 'local'
        ? localBaseIssue
        : (localBaseIssue ??
              readRemoteArchivePruneBaseIssue(base, archiveRef.repoPath));
}

function readRemoteArchivePruneBaseIssue(
    base: BaseRef,
    remoteRepoPath: string,
): null | string {
    const remoteBaseSha = readRefCommitSha(
        remoteRepoPath,
        `refs/heads/${base.branchName}`,
    );

    return remoteBaseSha === base.liveSha
        ? null
        : `remote default branch ${base.branchName} no longer matches the audited origin default branch.`;
}

function readArchiveRefSafetyIssue(
    archiveRef: ArchivePruneCandidate,
    baseRef: string,
    archivedSha: null | string,
): null | string {
    return (
        readArchiveRefObjectIssue(archiveRef, baseRef, archivedSha) ??
        readArchiveRefWorktreeIssue(archiveRef) ??
        readArchiveRefReflogIssue(archiveRef, baseRef)
    );
}

function readArchiveRefObjectIssue(
    archiveRef: ArchivePruneCandidate,
    baseRef: string,
    archivedSha: null | string,
): null | string {
    const overlayIssue = readHistoryRewriteOverlayIssue(archiveRef.repoPath);

    if (overlayIssue !== null) {
        return overlayIssue;
    }

    if (isSymbolicRef(archiveRef.repoPath, archiveRef.ref)) {
        return 'archive ref is symbolic.';
    }

    if (archivedSha === null) {
        return 'archive ref no longer resolves to a commit.';
    }

    return gitSucceeded(archiveRef.repoPath, [
        'merge-base',
        '--is-ancestor',
        archivedSha,
        baseRef,
    ])
        ? null
        : 'archive ref tip is not reachable from the canonical base.';
}

function readArchiveRefWorktreeIssue(
    archiveRef: ArchivePruneCandidate,
): null | string {
    try {
        const worktree = listWorktrees(archiveRef.repoPath).find(
            (candidate) => candidate.branchName === archiveRef.branchName,
        );

        return worktree === undefined
            ? null
            : `archive ref is checked out in worktree ${worktree.path}.`;
    } catch (error) {
        return `archive ref worktree state could not be checked: ${readUnknownErrorMessage(error)}`;
    }
}

function readArchiveRefReflogIssue(
    archiveRef: ArchivePruneCandidate,
    baseRef: string,
): null | string {
    const parsedReflog = readArchivedBranchReflog(
        archiveRef.repoPath,
        archiveRef.branchName,
    );

    if (parsedReflog === null || parsedReflog.shas.length === 0) {
        return 'archive ref reflog is unavailable.';
    }

    const uniqueCommitCount = countReflogOnlyCommits(
        archiveRef.repoPath,
        baseRef,
        parsedReflog.shas,
    );

    return readArchiveRefUniqueReflogIssue(uniqueCommitCount);
}

function readArchiveRefUniqueReflogIssue(
    uniqueCommitCount: null | number,
): null | string {
    if (uniqueCommitCount === null) {
        return 'archive ref reflog commits could not be verified.';
    }

    return uniqueCommitCount === 0
        ? null
        : `archive ref reflog retains ${uniqueCommitCount} commit(s) outside the canonical base.`;
}

function buildSkippedArchivePruneResult(
    archiveRef: ArchivePruneCandidate,
    archivedSha: null | string,
    skippedReason: string,
): ArchivePruneResult {
    return {
        archivedSha,
        errors: [],
        pruned: false,
        ref: archiveRef.ref,
        repoPath: archiveRef.repoPath,
        scope: archiveRef.scope,
        skippedReason,
    };
}

function deleteArchiveRef(
    archiveRef: ArchivePruneCandidate,
    archivedSha: string,
): ArchivePruneResult {
    const deleteResult = tryGit(archiveRef.repoPath, [
        'update-ref',
        '-d',
        archiveRef.ref,
        archivedSha,
    ]);

    return deleteResult.ok
        ? readDeletedArchiveRefResult(archiveRef, archivedSha)
        : buildFailedArchivePruneResult(archiveRef, archivedSha, deleteResult);
}

function readDeletedArchiveRefResult(
    archiveRef: ArchivePruneCandidate,
    archivedSha: string,
): ArchivePruneResult {
    return gitSucceeded(archiveRef.repoPath, [
        'show-ref',
        '--verify',
        '--quiet',
        archiveRef.ref,
    ])
        ? buildArchivePruneErrorResult(
              archiveRef,
              archivedSha,
              'archive ref still exists after deletion.',
          )
        : {
              archivedSha,
              errors: [],
              pruned: true,
              ref: archiveRef.ref,
              repoPath: archiveRef.repoPath,
              scope: archiveRef.scope,
              skippedReason: null,
          };
}

function buildFailedArchivePruneResult(
    archiveRef: ArchivePruneCandidate,
    archivedSha: null | string,
    deleteResult: GitCommandFailure,
): ArchivePruneResult {
    return buildArchivePruneErrorResult(
        archiveRef,
        archivedSha,
        deleteResult.error,
    );
}

function buildArchivePruneErrorResult(
    archiveRef: ArchivePruneCandidate,
    archivedSha: null | string,
    error: string,
): ArchivePruneResult {
    return {
        archivedSha,
        errors: [error],
        pruned: false,
        ref: archiveRef.ref,
        repoPath: archiveRef.repoPath,
        scope: archiveRef.scope,
        skippedReason: 'archive ref deletion failed.',
    };
}

function readLiveBaseValidationIssue(
    repoRoot: string,
    base: BaseRef,
): null | string {
    try {
        const originUrl = readOriginUrl(repoRoot);
        const originHead = readOriginHead(repoRoot);
        const localSha = readRefCommitSha(repoRoot, base.ref);

        if (originUrl !== base.remoteUrl) {
            return `origin changed from ${base.remoteUrl} to ${originUrl} during the audit.`;
        }

        if (originHead.branchName !== base.branchName) {
            return `origin/HEAD changed from ${base.branchName} to ${originHead.branchName} during the audit.`;
        }

        if (originHead.liveSha !== base.liveSha) {
            return `origin/${base.shortName} changed from ${base.liveSha.slice(0, 7)} to ${originHead.liveSha.slice(0, 7)} during the audit.`;
        }

        if (localSha !== base.liveSha) {
            return `local ${base.ref} changed during the audit.`;
        }

        return null;
    } catch (error) {
        return `origin default branch could not be revalidated after the audit: ${readUnknownErrorMessage(error)}`;
    }
}

function failClosedSafeDeleteBranches(
    branches: BranchBuckets,
    reason: string,
): BranchBuckets {
    return {
        needsReview: sortByName([
            ...branches.needsReview,
            ...branches.safeDelete.map((branch) =>
                convertSafeDeleteBranchToNeedsReview(branch, reason),
            ),
        ]),
        safeDelete: [],
        skipped: branches.skipped,
    };
}

function revalidateSafeDeleteBranchProofs(
    repoRoot: string,
    base: BaseRef,
    branches: BranchBuckets,
): BranchBuckets {
    const safeDelete: BranchReport[] = [];
    const needsReview = [...branches.needsReview];

    for (const branch of branches.safeDelete) {
        const staleProofIssue = readSafeDeleteProofValidation(
            repoRoot,
            base,
            branch,
        );

        if (staleProofIssue === null) {
            safeDelete.push(branch);
            continue;
        }

        needsReview.push(
            staleProofIssue.refreshedBranch === undefined
                ? convertSafeDeleteBranchToNeedsReview(
                      branch,
                      staleProofIssue.reason,
                  )
                : convertRefreshedBranchToNeedsReview(
                      staleProofIssue.refreshedBranch,
                      staleProofIssue.reason,
                  ),
        );
    }

    return {
        needsReview: sortByName(needsReview),
        safeDelete: sortByName(safeDelete),
        skipped: branches.skipped,
    };
}

function reconcileApplyReportBranches(
    repoRoot: string,
    base: BaseRef,
    branches: BranchBuckets,
    applyResults: readonly ApplyResult[],
): BranchBuckets {
    const resultsByBranch = new Map(
        applyResults.map((result) => [result.branch, result]),
    );
    const safeDelete: BranchReport[] = [];
    const needsReview = [...branches.needsReview];

    for (const branch of branches.safeDelete) {
        const applyResult = resultsByBranch.get(branch.name);
        const reconciledBranch = reconcileSafeDeleteBranchAfterApply(
            repoRoot,
            base,
            branch,
            applyResult,
        );

        if (reconciledBranch.classification === 'safe_delete') {
            safeDelete.push(reconciledBranch);
        } else {
            needsReview.push(reconciledBranch);
        }
    }

    return {
        needsReview: sortByName(needsReview),
        safeDelete: sortByName(safeDelete),
        skipped: branches.skipped,
    };
}

function reconcileSafeDeleteBranchAfterApply(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    applyResult: ApplyResult | undefined,
): BranchReport {
    if (applyResultCompletedLocalDeletion(applyResult)) {
        return convertAppliedSafeDeleteBranchToPostApplyReport(
            branch,
            applyResult,
        );
    }

    if (!branchRefExists(repoRoot, branch.name)) {
        return convertSafeDeleteBranchToNeedsReview(
            branch,
            `apply failed or skipped for ${branch.name}: ${readApplyResultIssue(applyResult, branch.name)}`,
        );
    }

    const refreshedBranch = readPostApplyBranchReport(repoRoot, base, branch);

    return refreshedBranch.classification === 'safe_delete'
        ? convertSafeDeleteBranchToNeedsReview(
              refreshedBranch,
              `apply failed or skipped for ${branch.name}: ${readApplyResultIssue(applyResult, branch.name)}`,
          )
        : refreshedBranch;
}

function readPostApplyBranchReport(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
): BranchReport {
    try {
        return readCurrentSafeDeleteBranchReport(repoRoot, base, branch.name);
    } catch (error) {
        return convertSafeDeleteBranchToNeedsReview(
            branch,
            `branch ${branch.name} could not be revalidated after apply: ${readUnknownErrorMessage(error)}`,
        );
    }
}

function applyResultCompletedLocalDeletion(
    result: ApplyResult | undefined,
): result is ApplyResult {
    return (
        result !== undefined &&
        result.errors.length === 0 &&
        result.localBranchDeleted
    );
}

function convertAppliedSafeDeleteBranchToPostApplyReport(
    branch: BranchReport,
    applyResult: ApplyResult,
): BranchReport {
    const remoteBranch = applyResult.remoteBranchDeleted
        ? readArchivedRemoteBranchPostApplyState(branch.remoteBranch)
        : branch.remoteBranch;
    const originBranchStatus = applyResult.remoteBranchDeleted
        ? 'absent'
        : branch.state.originBranchStatus;

    return {
        ...branch,
        classification: 'needs_review',
        deleteCommands: [],
        opinion: {
            code: 'keep_for_review',
            label: 'apply completed',
            reason: `git-cleanup already archived ${branch.name} during --apply, so no further delete command is emitted for the stale branch name.`,
        },
        reasonDetails: [
            ...branch.reasonDetails,
            `git-cleanup --apply already archived ${branch.name}; this post-apply report intentionally omits delete guidance for the stale branch name.`,
        ],
        remoteBranch,
        state: {
            ...branch.state,
            originBranchStatus,
            safeToDelete: false,
            safetyProofFingerprint: null,
        },
    };
}

function readArchivedRemoteBranchPostApplyState(
    remoteBranch: null | RemoteBranchAssessment,
): null | RemoteBranchAssessment {
    return remoteBranch === null
        ? null
        : {
              ...remoteBranch,
              liveSha: null,
              localTrackingProofFingerprint: null,
              localTrackingSha: null,
              remoteSafetyProofFingerprint: null,
              status: 'absent',
          };
}

function readApplyResultIssue(
    result: ApplyResult | undefined,
    branchName: string,
): string {
    if (result === undefined) {
        return `no apply result was recorded for ${branchName}.`;
    }

    const errorText = result.errors.join('; ');

    if (errorText !== '') {
        return errorText;
    }

    return (
        result.localBranchSkippedReason ??
        result.remoteBranchSkippedReason ??
        'the branch was not fully archived.'
    );
}

function readSafeDeleteProofValidation(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
): {
    reason: string;
    refreshedBranch?: BranchReport;
} | null {
    try {
        assertNoHistoryRewriteOverlays(repoRoot);
        const refreshedBranch = readCurrentSafeDeleteBranchReport(
            repoRoot,
            base,
            branch.name,
        );

        if (refreshedBranch.classification !== 'safe_delete') {
            return {
                reason: `branch ${branch.name} was no longer safe_delete during the final report proof recheck.`,
                refreshedBranch,
            };
        }

        if (
            branch.state.safetyProofFingerprint === null ||
            refreshedBranch.state.safetyProofFingerprint === null ||
            branch.state.safetyProofFingerprint !==
                refreshedBranch.state.safetyProofFingerprint
        ) {
            return {
                reason: `branch ${branch.name} safety proof changed during the final report proof recheck.`,
            };
        }

        return null;
    } catch (error) {
        return {
            reason: `branch ${branch.name} could not be revalidated during the final report proof recheck: ${readUnknownErrorMessage(error)}`,
        };
    }
}

function convertSafeDeleteBranchToNeedsReview(
    branch: BranchReport,
    reason: string,
): BranchReport {
    return {
        ...branch,
        classification: 'needs_review',
        deleteCommands: [],
        opinion: {
            code: 'needs_human_review',
            label: 'needs human review',
            reason: `the safe-delete proof became stale (${reason}).`,
        },
        reasonCodes: [
            ...branch.reasonCodes.filter(
                (reasonCode) => reasonCode !== 'origin_branch_absent',
            ),
            'origin_branch_history_unverified',
        ],
        reasonDetails: [
            ...branch.reasonDetails,
            `the origin default branch changed or could not be revalidated before report output (${reason}), so this branch requires manual review.`,
        ],
        state: {
            ...branch.state,
            originBranchStatus: 'history_unverified',
            safeToDelete: false,
            safetyProofFingerprint: null,
        },
    };
}

function convertRefreshedBranchToNeedsReview(
    branch: BranchReport,
    reason: string,
): BranchReport {
    return {
        ...branch,
        classification: 'needs_review',
        deleteCommands: [],
        opinion: {
            code: 'needs_human_review',
            label: 'needs human review',
            reason: `the safe-delete proof became stale (${reason}).`,
        },
        reasonDetails: [
            ...branch.reasonDetails,
            `the final proof recheck found the branch now requires manual review (${reason}).`,
        ],
        state: {
            ...branch.state,
            safeToDelete: false,
            safetyProofFingerprint: null,
        },
    };
}

function readGit(cwd: string, args: readonly string[]): string {
    return readGitRaw(cwd, args).trim();
}

function readGitRaw(cwd: string, args: readonly string[]): string {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        env: GIT_DISABLED_REWRITE_ENV,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function assertNoHistoryRewriteOverlays(repoRoot: string): void {
    const overlayIssue = readHistoryRewriteOverlayIssue(repoRoot);

    if (overlayIssue !== null) {
        throw new Error(overlayIssue);
    }
}

function readHistoryRewriteOverlayIssue(repoPath: string): null | string {
    const gitDirectories = readGitDirectories(repoPath);

    if (gitDirectories === null) {
        return 'git-cleanup could not resolve the git admin directories needed to verify graft safety.';
    }

    if (existsSync(join(gitDirectories.commonGitDir, 'info', 'grafts'))) {
        return 'git-cleanup refuses to run while .git/info/grafts exists. Remove the grafts file before auditing deletions.';
    }

    const replaceRefs = tryGit(repoPath, [
        'for-each-ref',
        'refs/replace',
        '--format=%(refname)',
    ]);

    if (!replaceRefs.ok) {
        return `git-cleanup could not verify refs/replace safety: ${replaceRefs.error}`;
    }

    return replaceRefs.stdout === ''
        ? null
        : 'git-cleanup refuses to run while refs/replace/* exists. Remove or disable replace refs before auditing deletions.';
}

function detectBaseRef(
    repoRoot: string,
    requestedBase: null | string,
    expectedOriginUrl?: string,
    expectedOriginHead?: Pick<BaseRef, 'branchName' | 'liveSha'>,
): BaseRef {
    const originHead = readOriginHead(repoRoot);
    const originUrl = readOriginUrl(repoRoot);

    if (expectedOriginUrl !== undefined && originUrl !== expectedOriginUrl) {
        throw new Error(
            `origin now points to ${originUrl}, but the audit was run against ${expectedOriginUrl}.`,
        );
    }

    if (
        expectedOriginHead !== undefined &&
        originHead.branchName !== expectedOriginHead.branchName
    ) {
        throw new Error(
            `origin/HEAD changed from ${expectedOriginHead.branchName} to ${originHead.branchName} during revalidation.`,
        );
    }

    if (
        expectedOriginHead !== undefined &&
        originHead.liveSha !== expectedOriginHead.liveSha
    ) {
        throw new Error(
            `origin/${expectedOriginHead.branchName} changed from ${expectedOriginHead.liveSha.slice(0, 7)} to ${originHead.liveSha.slice(0, 7)} during revalidation.`,
        );
    }

    const canonicalRef = `refs/remotes/origin/${originHead.branchName}`;
    const localSha = readRequiredCommitSha(
        repoRoot,
        canonicalRef,
        `Remote-tracking ref ${canonicalRef} is missing locally. Fetch origin/${originHead.branchName} before running git-cleanup.`,
    );

    if (localSha !== originHead.liveSha) {
        throw new Error(
            `Local ${canonicalRef} is stale (${localSha.slice(0, 7)}), but origin advertises ${originHead.liveSha.slice(0, 7)}. Fetch origin/${originHead.branchName} before running git-cleanup.`,
        );
    }

    if (requestedBase !== null) {
        validateRequestedBaseRef(repoRoot, requestedBase, originHead.liveSha);
    }

    return {
        branchName: originHead.branchName,
        liveSha: originHead.liveSha,
        localSha,
        ref: canonicalRef,
        remoteUrl: originUrl,
        shortName: originHead.branchName,
        source: requestedBase === null ? 'origin_live_head' : 'cli',
    };
}

function readOriginHead(repoRoot: string): OriginHead {
    if (!listRemotes(repoRoot).includes('origin')) {
        throw new Error(
            'git-cleanup requires an origin remote so safety can be proven against origin’s live default branch.',
        );
    }

    const output = tryGit(repoRoot, [
        'ls-remote',
        '--symref',
        'origin',
        'HEAD',
    ]);

    if (!output.ok || output.stdout === '') {
        throw new Error(
            'Unable to read origin/HEAD from the live remote. git-cleanup fails closed without a canonical origin default branch.',
        );
    }

    const branchName = parseRemoteHeadBranch(output.stdout);
    const liveSha = parseRemoteHeadSha(output.stdout);

    if (branchName === null || liveSha === null) {
        throw new Error(
            'Unable to parse origin/HEAD from the live remote. git-cleanup fails closed without a canonical origin default branch.',
        );
    }

    return {
        branchName,
        liveSha,
    };
}

function listRemotes(repoRoot: string): string[] {
    const remotes = readGit(repoRoot, ['remote']);
    return remotes === '' ? [] : remotes.split('\n');
}

function tryGit(cwd: string, args: readonly string[]): GitCommandResult {
    try {
        return {
            ok: true,
            stdout: readGit(cwd, args),
        };
    } catch (error) {
        const stderr = readProcessOutput(error, 'stderr');
        const stdout = readProcessOutput(error, 'stdout');

        return {
            error:
                stderr === ''
                    ? stdout || readUnknownErrorMessage(error)
                    : stderr,
            ok: false,
            stdout,
        };
    }
}

function readGitDirectories(repoPath: string): GitDirectories | null {
    const absoluteGitDir = tryGit(repoPath, [
        'rev-parse',
        '--path-format=absolute',
        '--absolute-git-dir',
    ]);
    const commonGitDir = tryGit(repoPath, [
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
    ]);

    if (
        !absoluteGitDir.ok ||
        absoluteGitDir.stdout === '' ||
        !commonGitDir.ok ||
        commonGitDir.stdout === ''
    ) {
        return null;
    }

    return {
        absoluteGitDir: absoluteGitDir.stdout,
        commonGitDir: commonGitDir.stdout,
    };
}

function readProcessOutput(error: unknown, key: 'stderr' | 'stdout'): string {
    const value = readUnknownObjectValue(error, key);

    if (typeof value === 'string') {
        return value.trim();
    }

    if (Buffer.isBuffer(value)) {
        return value.toString('utf8').trim();
    }

    return '';
}

function readUnknownObjectValue(error: unknown, key: string): unknown {
    if (typeof error !== 'object' || error === null) {
        return undefined;
    }

    return Reflect.get(error, key);
}

function readUnknownErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function parseRemoteHeadBranch(remoteHeadOutput: string): null | string {
    for (const line of remoteHeadOutput.split('\n')) {
        if (!line.startsWith('ref: refs/heads/')) {
            continue;
        }

        const branchLine = line.slice('ref: refs/heads/'.length);
        const separatorIndex = branchLine.indexOf('\t');

        if (separatorIndex === -1) {
            continue;
        }

        return branchLine.slice(0, separatorIndex);
    }

    return null;
}

function parseRemoteHeadSha(remoteHeadOutput: string): null | string {
    for (const line of remoteHeadOutput.split('\n')) {
        if (line.startsWith('ref: ')) {
            continue;
        }

        const [sha = '', target = ''] = line.split('\t');

        if (target === 'HEAD' && sha !== '') {
            return sha;
        }
    }

    return null;
}

function readOriginUrl(repoRoot: string): string {
    return readGit(repoRoot, ['config', '--get', 'remote.origin.url']);
}

function readReachableHiddenRefAnalysis(
    repoPath: string,
    baseRef: string,
): HiddenRefAnalysis {
    const gitDirectories = readGitDirectories(repoPath);

    if (gitDirectories === null) {
        return {
            available: false,
            fingerprint: null,
            refs: [],
        };
    }

    const hiddenRefs = tryGit(repoPath, [
        'for-each-ref',
        '--format=%(refname)',
    ]);

    if (!hiddenRefs.ok) {
        return {
            available: false,
            fingerprint: null,
            refs: [],
        };
    }

    const worktreePrivateRefs = readWorktreePrivateRefsOutsideBase(
        repoPath,
        baseRef,
        gitDirectories.commonGitDir,
    );

    if (worktreePrivateRefs === null) {
        return {
            available: false,
            fingerprint: null,
            refs: [],
        };
    }

    const detachedWorktreeHeads = readDetachedWorktreeHeadsOutsideBase(
        repoPath,
        baseRef,
        gitDirectories.commonGitDir,
    );

    if (detachedWorktreeHeads === null) {
        return {
            available: false,
            fingerprint: null,
            refs: [],
        };
    }

    const refs = [
        ...(hiddenRefs.stdout === ''
            ? []
            : hiddenRefs.stdout
                  .split('\n')
                  .filter((ref) => !ref.startsWith('refs/worktree/'))
                  .filter(
                      (ref) => !isRefReachableFromBase(repoPath, ref, baseRef),
                  )),
        ...worktreePrivateRefs,
        ...detachedWorktreeHeads,
    ];

    return {
        available: true,
        fingerprint: stableHash(refs.join('\n')),
        refs,
    };
}

export function readReachableHiddenRefsForTesting(
    repoPath: string,
    baseRef: string,
): null | string[] {
    const analysis = readReachableHiddenRefAnalysis(repoPath, baseRef);

    return analysis.available ? analysis.refs : null;
}

function readDetachedWorktreeHeadsOutsideBase(
    repoPath: string,
    baseRef: string,
    commonGitDir: string,
): null | string[] {
    const worktreeNames = readLinkedWorktreeAdminNames(
        join(commonGitDir, 'worktrees'),
    );

    if (worktreeNames === null) {
        return null;
    }

    const primaryHeadRef = readDetachedWorktreeHeadRefOutsideBase(
        repoPath,
        baseRef,
        'HEAD',
        join(commonGitDir, 'HEAD'),
    );
    const linkedHeadRefs = worktreeNames.flatMap((worktreeName) => {
        const worktreeHeadRef = readDetachedWorktreeHeadRefOutsideBase(
            repoPath,
            baseRef,
            `worktrees/${worktreeName}/HEAD`,
            join(commonGitDir, 'worktrees', worktreeName, 'HEAD'),
        );

        return worktreeHeadRef === null ? [] : [worktreeHeadRef];
    });

    return primaryHeadRef === null
        ? linkedHeadRefs
        : [primaryHeadRef, ...linkedHeadRefs];
}

function readWorktreePrivateRefsOutsideBase(
    repoPath: string,
    baseRef: string,
    commonGitDir: string,
): null | string[] {
    const linkedWorktreeNames = readLinkedWorktreeAdminNames(
        join(commonGitDir, 'worktrees'),
    );

    return linkedWorktreeNames === null
        ? null
        : [
              readWorktreePrivateRefsOutsideBaseFromGitDir(
                  repoPath,
                  baseRef,
                  commonGitDir,
                  'worktree:primary',
              ),
              ...linkedWorktreeNames.map((worktreeName) =>
                  readWorktreePrivateRefsOutsideBaseFromGitDir(
                      repoPath,
                      baseRef,
                      join(commonGitDir, 'worktrees', worktreeName),
                      `worktree:${worktreeName}`,
                  ),
              ),
          ].reduce<null | string[]>((refs, nextRefs) => {
              if (refs === null || nextRefs === null) {
                  return null;
              }

              return [...refs, ...nextRefs];
          }, []);
}

function readWorktreePrivateRefsOutsideBaseFromGitDir(
    repoPath: string,
    baseRef: string,
    gitDir: string,
    labelPrefix: string,
): null | string[] {
    const privateRefs = tryGit(repoPath, [
        '--git-dir',
        gitDir,
        'for-each-ref',
        'refs/worktree',
        '--format=%(refname)',
    ]);

    if (!privateRefs.ok) {
        return null;
    }

    return privateRefs.stdout === ''
        ? []
        : privateRefs.stdout
              .split('\n')
              .filter(
                  (ref) =>
                      !isGitDirRefReachableFromBase(
                          repoPath,
                          gitDir,
                          ref,
                          baseRef,
                      ),
              )
              .map((ref) => `${labelPrefix}/${ref}`);
}

function isGitDirRefReachableFromBase(
    repoPath: string,
    gitDir: string,
    ref: string,
    baseRef: string,
): boolean {
    if (readGitDirRefObjectType(repoPath, gitDir, ref) !== 'commit') {
        return false;
    }

    const commitSha = readGitDirRefCommitSha(repoPath, gitDir, ref);

    return (
        commitSha !== null &&
        gitSucceeded(repoPath, [
            '--git-dir',
            gitDir,
            'merge-base',
            '--is-ancestor',
            commitSha,
            baseRef,
        ])
    );
}

function readGitDirRefObjectType(
    repoPath: string,
    gitDir: string,
    ref: string,
): null | string {
    const objectType = tryGit(repoPath, [
        '--git-dir',
        gitDir,
        'cat-file',
        '-t',
        ref,
    ]);

    return objectType.ok && objectType.stdout !== '' ? objectType.stdout : null;
}

function readGitDirRefCommitSha(
    repoPath: string,
    gitDir: string,
    ref: string,
): null | string {
    const commitSha = tryGit(repoPath, [
        '--git-dir',
        gitDir,
        'rev-parse',
        '--verify',
        `${ref}^{commit}`,
    ]);

    return commitSha.ok && commitSha.stdout !== '' ? commitSha.stdout : null;
}

function readLinkedWorktreeAdminNames(worktreesRoot: string): null | string[] {
    if (!existsSync(worktreesRoot)) {
        return [];
    }

    try {
        return readdirSync(worktreesRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    } catch {
        return null;
    }
}

function readDetachedWorktreeHeadRefOutsideBase(
    repoPath: string,
    baseRef: string,
    label: string,
    headPath: string,
): null | string {
    if (!existsSync(headPath)) {
        return label;
    }

    const headValue = readFileSync(headPath, 'utf8').trim();

    if (headValue.startsWith('ref: ')) {
        return null;
    }

    return isDetachedWorktreeHeadReachableFromBase(repoPath, baseRef, headValue)
        ? null
        : label;
}

function isDetachedWorktreeHeadReachableFromBase(
    repoPath: string,
    baseRef: string,
    headValue: string,
): boolean {
    return (
        isReflogSha(headValue) &&
        gitSucceeded(repoPath, ['cat-file', '-e', `${headValue}^{commit}`]) &&
        gitSucceeded(repoPath, [
            'merge-base',
            '--is-ancestor',
            headValue,
            baseRef,
        ])
    );
}

function isRefReachableFromBase(
    repoPath: string,
    ref: string,
    baseRef: string,
): boolean {
    if (readRefObjectType(repoPath, ref) !== 'commit') {
        return false;
    }

    const commitSha = readRefCommitSha(repoPath, ref);

    return (
        commitSha !== null &&
        gitSucceeded(repoPath, [
            'merge-base',
            '--is-ancestor',
            commitSha,
            baseRef,
        ])
    );
}

function readRefObjectType(repoPath: string, ref: string): null | string {
    const objectType = tryGit(repoPath, ['cat-file', '-t', ref]);

    return objectType.ok && objectType.stdout !== '' ? objectType.stdout : null;
}

function isBranchSymbolicRef(repoPath: string, branch: string): boolean {
    return gitSucceeded(repoPath, [
        'symbolic-ref',
        '-q',
        '--no-recurse',
        `refs/heads/${branch}`,
    ]);
}

function isSymbolicRef(repoPath: string, ref: string): boolean {
    return gitSucceeded(repoPath, ['symbolic-ref', '-q', '--no-recurse', ref]);
}

function readRefCommitSha(repoPath: string, ref: string): null | string {
    const commitSha = tryGit(repoPath, [
        'rev-parse',
        '--verify',
        `${ref}^{commit}`,
    ]);

    return commitSha.ok && commitSha.stdout !== '' ? commitSha.stdout : null;
}

function readRequiredCommitSha(
    repoRoot: string,
    ref: string,
    errorMessage: string,
): string {
    const result = tryGit(repoRoot, [
        'rev-parse',
        '--verify',
        `${ref}^{commit}`,
    ]);

    if (!result.ok || result.stdout === '') {
        throw new Error(errorMessage);
    }

    return result.stdout;
}

function validateRequestedBaseRef(
    repoRoot: string,
    requestedBase: string,
    canonicalSha: string,
): void {
    const requestedSha = readRequiredCommitSha(
        repoRoot,
        requestedBase,
        `The requested --base ref ${requestedBase} does not resolve to a commit.`,
    );

    if (requestedSha !== canonicalSha) {
        throw new Error(
            `The requested --base ref ${requestedBase} is not origin’s live default branch. Expected commit ${canonicalSha.slice(0, 7)}.`,
        );
    }
}

function readRepositoryUnreachableCommitAnalysis(
    repoRoot: string,
): RepositoryUnreachableCommitAnalysis {
    const result = tryGit(repoRoot, [
        'fsck',
        '--unreachable',
        '--no-reflogs',
        '--no-progress',
    ]);

    if (!result.ok) {
        return {
            available: false,
            commitCount: 0,
            fingerprint: null,
        };
    }

    const unreachableObjectLines = result.stdout
        .split('\n')
        .filter((line) =>
            /^unreachable (?:blob|commit|tag|tree) [0-9a-f]+$/iu.test(line),
        );

    return {
        available: true,
        commitCount: unreachableObjectLines.length,
        fingerprint: stableHash(unreachableObjectLines.join('\n')),
    };
}

function readRepositoryReflogAnalysis(
    repoPath: string,
    baseRef: string,
): ReflogAnalysis {
    const repositoryReflogSnapshot = readRepositoryReflogSnapshot(repoPath);

    if (repositoryReflogSnapshot === null) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    const uniqueCommitCount = countReflogOnlyCommits(repoPath, baseRef, [
        ...repositoryReflogSnapshot.shas,
    ]);

    if (uniqueCommitCount === null) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    return {
        available: true,
        fingerprint: repositoryReflogSnapshot.fingerprint,
        uniqueCommitCount,
    };
}

function readRepositoryReflogSnapshot(repoPath: string): {
    fingerprint: string;
    shas: Set<string>;
} | null {
    const reflogPaths = readRepositoryReflogPaths(repoPath);

    if (reflogPaths === null) {
        return null;
    }

    const reflogShas = new Set<string>();
    const reflogFingerprints: string[] = [];

    for (const reflogPath of reflogPaths) {
        const parsedReflog = readReflogShas(reflogPath);

        if (parsedReflog === null) {
            return null;
        }

        reflogFingerprints.push(
            `${reflogPath}\u001f${parsedReflog.fingerprint}`,
        );

        for (const sha of parsedReflog.shas) {
            reflogShas.add(sha);
        }
    }

    return {
        fingerprint: stableHash(reflogFingerprints.join('\u001e')),
        shas: reflogShas,
    };
}

function readRepositoryReflogPaths(repoPath: string): null | string[] {
    const gitDirectories = readGitDirectories(repoPath);

    if (gitDirectories === null) {
        return null;
    }

    const reflogPaths = readReflogPathsRecursively(
        join(gitDirectories.commonGitDir, 'logs'),
    );
    const linkedWorktreeReflogPaths = readLinkedWorktreeReflogPaths(
        gitDirectories.commonGitDir,
    );

    if (reflogPaths === null || linkedWorktreeReflogPaths === null) {
        return null;
    }

    const combinedReflogPaths = [...reflogPaths, ...linkedWorktreeReflogPaths];

    return combinedReflogPaths.length === 0 ? null : combinedReflogPaths;
}

function readLinkedWorktreeReflogPaths(commonGitDir: string): null | string[] {
    const worktreesRoot = join(commonGitDir, 'worktrees');

    if (!existsSync(worktreesRoot)) {
        return [];
    }

    try {
        return readdirSync(worktreesRoot, { withFileTypes: true }).reduce<
            null | string[]
        >((paths, entry) => {
            if (paths === null) {
                return null;
            }

            if (!entry.isDirectory()) {
                return paths;
            }

            const worktreeReflogPaths = readOptionalReflogPathsRecursively(
                join(worktreesRoot, entry.name, 'logs'),
            );

            return worktreeReflogPaths === null
                ? null
                : [...paths, ...worktreeReflogPaths];
        }, []);
    } catch {
        return null;
    }
}

function readOptionalReflogPathsRecursively(logsRoot: string): null | string[] {
    if (!existsSync(logsRoot)) {
        return [];
    }

    try {
        return readReflogPathsRecursivelyFrom(logsRoot);
    } catch {
        return null;
    }
}

function readReflogPathsRecursively(logsRoot: string): null | string[] {
    if (!existsSync(logsRoot)) {
        return null;
    }

    try {
        return readReflogPathsRecursivelyFrom(logsRoot);
    } catch {
        return null;
    }
}

function readReflogPathsRecursivelyFrom(logsRoot: string): string[] {
    const reflogPaths: string[] = [];

    for (const entry of readdirSync(logsRoot, { withFileTypes: true })) {
        const entryPath = join(logsRoot, entry.name);

        if (entry.isDirectory()) {
            reflogPaths.push(...readReflogPathsRecursivelyFrom(entryPath));
            continue;
        }

        if (entry.isFile()) {
            reflogPaths.push(entryPath);
        }
    }

    return reflogPaths;
}

function listBranches(repoRoot: string): string[] {
    const output = readGit(repoRoot, [
        'for-each-ref',
        'refs/heads',
        '--format=%(refname:short)',
    ]);

    return output === ''
        ? []
        : output
              .split('\n')
              .filter(
                  (branchName) => !isGitCleanupArchiveBranchName(branchName),
              );
}

function isGitCleanupArchiveBranchName(branchName: string): boolean {
    return (
        branchName === GIT_CLEANUP_ARCHIVE_BRANCH_PREFIX ||
        branchName.startsWith(`${GIT_CLEANUP_ARCHIVE_BRANCH_PREFIX}/`)
    );
}

function listWorktrees(repoRoot: string): WorktreeInfo[] {
    const output = readGitRaw(repoRoot, [
        'worktree',
        'list',
        '--porcelain',
        '-z',
    ]);

    if (output === '') {
        return [];
    }

    const worktrees: WorktreeInfo[] = [];

    for (const [index, fields] of parseWorktreeFieldBlocks(output).entries()) {
        const seed = parseWorktreeBlock(fields, index);
        worktrees.push(hydrateWorktree(seed));
    }

    return worktrees;
}

function parseWorktreeFieldBlocks(output: string): string[][] {
    const blocks: string[][] = [];

    for (const field of output.split('\0')) {
        const currentBlock = blocks.at(-1);

        if (field === '') {
            if (currentBlock === undefined || currentBlock.length > 0) {
                blocks.push([]);
            }

            continue;
        }

        if (currentBlock === undefined) {
            blocks.push([field]);
        } else {
            currentBlock.push(field);
        }
    }

    return blocks.filter((block) => block.length > 0);
}

function parseWorktreeBlock(
    fields: readonly string[],
    index: number,
): WorktreeSeed {
    return fields.reduce<WorktreeSeed>(
        (worktree, line) => {
            return applyWorktreeLine(worktree, line);
        },
        {
            bare: false,
            branchName: null,
            headSha: '',
            isPrimary: index === 0,
            locked: false,
            path: '',
            prunable: false,
        },
    );
}

function applyWorktreeLine(worktree: WorktreeSeed, line: string): WorktreeSeed {
    if (line.startsWith('worktree ')) {
        return {
            ...worktree,
            path: line.slice('worktree '.length),
        };
    }

    if (line.startsWith('HEAD ')) {
        return {
            ...worktree,
            headSha: line.slice('HEAD '.length),
        };
    }

    if (line.startsWith('branch ')) {
        return {
            ...worktree,
            branchName: line
                .slice('branch '.length)
                .replace(/^refs\/heads\//u, ''),
        };
    }

    if (line === 'bare') {
        return {
            ...worktree,
            bare: true,
        };
    }

    if (line.startsWith('prunable')) {
        return {
            ...worktree,
            prunable: true,
        };
    }

    if (line.startsWith('locked')) {
        return {
            ...worktree,
            locked: true,
        };
    }

    return worktree;
}

function hydrateWorktree(worktree: WorktreeSeed): WorktreeInfo {
    if (!existsSync(worktree.path)) {
        return {
            ...worktree,
            state: 'missing',
            statusLines: [],
        };
    }

    if (worktree.prunable) {
        return {
            ...worktree,
            state: 'prunable',
            statusLines: [],
        };
    }

    const statusLines = readWorktreeStatusLines(worktree.path, worktree.bare);
    const safetyLines = worktree.locked
        ? ['!! linked worktree is locked and requires manual review']
        : [];
    const combinedStatusLines = [...statusLines, ...safetyLines];

    return {
        ...worktree,
        state: combinedStatusLines.length === 0 ? 'clean' : 'dirty',
        statusLines: combinedStatusLines,
    };
}

function readWorktreeStatusLines(
    worktreePath: string,
    bare: boolean,
): string[] {
    if (bare) {
        return readGitAdminWarnings(worktreePath);
    }

    return [
        ...readStatusLines(worktreePath),
        ...readHiddenTrackedPathWarnings(worktreePath),
        ...readGitAdminWarnings(worktreePath),
        ...readSubmoduleWarnings(worktreePath),
    ];
}

function readStatusLines(worktreePath: string): string[] {
    const output = tryGit(worktreePath, [
        'status',
        '--porcelain',
        '--untracked-files=all',
        '--ignored=matching',
    ]);

    if (!output.ok) {
        return [`!! unable to read git status: ${output.error}`];
    }

    return output.stdout === '' ? [] : output.stdout.split('\n');
}

function readHiddenTrackedPathWarnings(worktreePath: string): string[] {
    const output = tryGit(worktreePath, ['ls-files', '-v']);

    if (!output.ok) {
        return [`!! unable to verify hidden tracked paths: ${output.error}`];
    }

    if (output.stdout === '') {
        return [];
    }

    const warnings: string[] = [];

    for (const line of output.stdout.split('\n')) {
        const flag = line[0] ?? '';

        if (flag === '' || line.length < 3) {
            continue;
        }

        if (flag === 'S' || flag === flag.toLowerCase()) {
            warnings.push(`!! hidden tracked path ${line.slice(2)}`);
        }
    }

    return warnings;
}

function readGitAdminWarnings(worktreePath: string): string[] {
    const adminDirectories = readGitAdminDirectories(worktreePath);

    return adminDirectories === null
        ? ['!! unable to resolve git admin directory']
        : adminDirectories.flatMap(readGitAdminDirectoryWarnings);
}

function readGitAdminDirectories(worktreePath: string): null | string[] {
    const gitDirResult = tryGit(worktreePath, [
        'rev-parse',
        '--absolute-git-dir',
    ]);
    const gitCommonDirResult = tryGit(worktreePath, [
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
    ]);

    if (
        !gitDirResult.ok ||
        gitDirResult.stdout === '' ||
        !gitCommonDirResult.ok ||
        gitCommonDirResult.stdout === ''
    ) {
        return null;
    }

    return Array.from(
        new Set([gitCommonDirResult.stdout, gitDirResult.stdout]),
    );
}

function readGitAdminDirectoryWarnings(adminDirectory: string): string[] {
    return [
        ...readGitAdminFileWarnings(adminDirectory),
        ...readGitAdminStateDirectoryWarnings(adminDirectory),
        ...readGitLockWarnings(adminDirectory),
    ];
}

function readGitAdminFileWarnings(adminDirectory: string): string[] {
    return GIT_ADMIN_FILES.filter((fileName) =>
        existsSync(join(adminDirectory, fileName)),
    ).map((fileName) => `!! git operation in progress: ${fileName}`);
}

function readGitAdminStateDirectoryWarnings(adminDirectory: string): string[] {
    return GIT_ADMIN_DIRECTORIES.filter((directoryName) =>
        existsSync(join(adminDirectory, directoryName)),
    ).map((directoryName) => `!! git operation in progress: ${directoryName}`);
}

function readGitLockWarnings(adminDirectory: string): string[] {
    const lockFileResult = listGitLockFiles(adminDirectory);

    return lockFileResult.ok
        ? lockFileResult.lockFiles.map(
              (fileName) => `!! git operation in progress: ${fileName}`,
          )
        : [
              `!! unable to verify git lock state in ${adminDirectory}: ${lockFileResult.error}`,
          ];
}

function listGitLockFiles(
    directoryPath: string,
    relativePrefix = '',
):
    | {
          error: string;
          ok: false;
      }
    | {
          lockFiles: string[];
          ok: true;
      } {
    const readEntriesResult = readGitDirectoryEntries(directoryPath);

    if (!readEntriesResult.ok) {
        return readEntriesResult;
    }

    const lockFiles: string[] = [];

    for (const entry of readEntriesResult.entries) {
        const entryLockFileResult = readGitLockFilesForEntry(
            directoryPath,
            relativePrefix,
            entry,
        );

        if (!entryLockFileResult.ok) {
            return entryLockFileResult;
        }

        lockFiles.push(...entryLockFileResult.lockFiles);
    }

    return {
        lockFiles,
        ok: true,
    };
}

function readGitLockFilesForEntry(
    directoryPath: string,
    relativePrefix: string,
    entry: GitDirectoryEntry,
):
    | {
          error: string;
          ok: false;
      }
    | {
          lockFiles: string[];
          ok: true;
      } {
    const relativePath =
        relativePrefix === '' ? entry.name : `${relativePrefix}/${entry.name}`;

    if (entry.isFile() && entry.name.endsWith('.lock')) {
        return {
            lockFiles: [relativePath],
            ok: true,
        };
    }

    return entry.isDirectory()
        ? listGitLockFiles(join(directoryPath, entry.name), relativePath)
        : {
              lockFiles: [],
              ok: true,
          };
}

function readGitDirectoryEntries(
    directoryPath: string,
): GitDirectoryEntryReadResult {
    try {
        return {
            entries: readdirSync(directoryPath, {
                encoding: 'utf8',
                withFileTypes: true,
            }),
            ok: true,
        };
    } catch (error) {
        return {
            error: readUnknownErrorMessage(error),
            ok: false,
        };
    }
}

function readSubmoduleWarnings(worktreePath: string): string[] {
    const hasGitmodules = existsSync(join(worktreePath, '.gitmodules'));
    const gitlinkInspection = readGitlinkInspection(worktreePath);

    if (!hasGitmodules && gitlinkInspection.status === 'absent') {
        return [];
    }

    if (gitlinkInspection.status === 'unavailable') {
        return [
            `!! unable to verify gitlink state: ${gitlinkInspection.error}`,
        ];
    }

    const output = tryGit(worktreePath, ['submodule', 'status', '--recursive']);

    if (!output.ok) {
        return [`!! unable to verify submodule state: ${output.error}`];
    }

    return readSubmoduleWarningsForStatus(output.stdout);
}

function readSubmoduleWarningsForStatus(statusOutput: string): string[] {
    if (statusOutput === '') {
        return [
            '!! submodules are configured; linked worktrees with submodules are review-only',
        ];
    }

    return statusOutput
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => `!! submodule present ${line}`);
}

function readGitlinkInspection(worktreePath: string):
    | {
          error: string;
          status: 'unavailable';
      }
    | {
          status: 'absent' | 'present';
      } {
    const output = tryGit(worktreePath, ['ls-files', '-s']);

    if (!output.ok) {
        return {
            error: output.error,
            status: 'unavailable',
        };
    }

    return output.stdout.split('\n').some((line) => line.startsWith('160000 '))
        ? { status: 'present' }
        : { status: 'absent' };
}

function buildBranchBuckets(
    repoRoot: string,
    base: BaseRef,
    localBranches: readonly string[],
    worktrees: readonly WorktreeInfo[],
    detachedWorktrees: readonly DetachedWorktreeReport[],
    hiddenRefAnalysis: HiddenRefAnalysis,
    repositoryReflogAnalysis: ReflogAnalysis,
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
): BranchBuckets {
    const skipped: SkippedBranchReport[] = [];
    const safeDelete: BranchReport[] = [];
    const needsReview: BranchReport[] = [];

    for (const branch of localBranches) {
        const report = buildBranchReport(
            repoRoot,
            base,
            branch,
            worktrees,
            detachedWorktrees,
            hiddenRefAnalysis,
            repositoryReflogAnalysis,
            unreachableCommitAnalysis,
        );

        if (branch === base.branchName) {
            if (protectedBaseBranchNeedsReview(report)) {
                needsReview.push(report);
            } else {
                skipped.push(buildSkippedBranchReport(base));
            }

            continue;
        }

        if (report.classification === 'safe_delete') {
            safeDelete.push(report);
            continue;
        }

        needsReview.push(report);
    }

    return {
        needsReview: sortByName(needsReview),
        safeDelete: sortByName(safeDelete),
        skipped,
    };
}

function protectedBaseBranchNeedsReview(report: BranchReport): boolean {
    const state = report.state;

    return (
        protectedBranchStateNeedsReview(state) ||
        protectedBaseRemoteStateNeedsReview(report.remoteBranch)
    );
}

function protectedBaseRemoteStateNeedsReview(
    remoteBranch: null | RemoteBranchAssessment,
): boolean {
    return remoteBranch !== null && remoteBranch.status !== 'protected_base';
}

function protectedBranchStateNeedsReview(state: BranchState): boolean {
    return (
        !state.branchTipOnBase ||
        !state.branchReflogAvailable ||
        state.branchReflogUniqueCommitCount > 0 ||
        state.hasBlockingDetachedWorktree
    );
}

function buildSkippedBranchReport(base: BaseRef): SkippedBranchReport {
    return {
        classification: 'skipped',
        name: base.branchName,
        reasonCodes: PROTECTED_BRANCH_REASON_CODES,
        reasonDetails: [
            `the canonical origin default branch ${base.branchName} is protected from automatic cleanup.`,
        ],
        ref: base.ref,
    };
}

function buildBranchReport(
    repoRoot: string,
    base: BaseRef,
    branch: string,
    worktrees: readonly WorktreeInfo[],
    detachedWorktrees: readonly DetachedWorktreeReport[],
    hiddenRefAnalysis: HiddenRefAnalysis,
    repositoryReflogAnalysis: ReflogAnalysis,
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
): BranchReport {
    const linkedWorktrees = worktrees.filter(
        (worktree) => worktree.branchName === branch,
    );
    const hasCommonAncestor = gitSucceeded(repoRoot, [
        'merge-base',
        base.liveSha,
        branch,
    ]);
    const uniqueCommitCount = readUniqueCommitCount(
        repoRoot,
        base.liveSha,
        branch,
        hasCommonAncestor,
    );
    const lastCommit = readSingleCommit(repoRoot, branch);
    const recentCommits = readRecentCommits(repoRoot, branch);
    const branchReflogAnalysis = readBranchReflogAnalysis(
        repoRoot,
        base.liveSha,
        branch,
    );
    const remoteBranch = assessRemoteBranch(repoRoot, base, branch);
    const state = buildBranchState(
        repoRoot,
        base.liveSha,
        branch,
        linkedWorktrees,
        worktrees,
        hasCommonAncestor,
        uniqueCommitCount,
        branchReflogAnalysis,
        detachedWorktrees,
        hiddenRefAnalysis,
        repositoryReflogAnalysis,
        unreachableCommitAnalysis,
        remoteBranch,
    );

    return {
        activity: summarizeBranchActivity(base.shortName, lastCommit, state),
        classification: state.safeToDelete ? 'safe_delete' : 'needs_review',
        deleteCommands: buildDeleteCommands(
            branch,
            linkedWorktrees,
            remoteBranch,
            state,
        ),
        linkedWorktrees,
        name: branch,
        opinion: decideBranchOpinion(branch, lastCommit, state),
        reasonCodes: collectBranchReasonCodes(branch, state, remoteBranch),
        reasonDetails: buildBranchReasonDetails(
            branch,
            base.shortName,
            linkedWorktrees,
            detachedWorktrees,
            state,
            remoteBranch,
        ),
        recentCommits,
        remoteBranch,
        state,
    };
}

function gitSucceeded(cwd: string, args: readonly string[]): boolean {
    return tryGit(cwd, args).ok;
}

function readUniqueCommitCount(
    repoRoot: string,
    baseRef: string,
    branch: string,
    hasCommonAncestor: boolean,
): number {
    const output = readGit(repoRoot, [
        'rev-list',
        '--count',
        hasCommonAncestor ? `${baseRef}..${branch}` : branch,
    ]);
    const count = Number.parseInt(output, 10);

    if (Number.isNaN(count)) {
        throw new Error(`Unable to count commits unique to ${branch}.`);
    }

    return count;
}

function readSingleCommit(repoRoot: string, ref: string): CommitInfo {
    const commit = readCommitLog(repoRoot, ['-1', ref])[0];

    if (commit === undefined) {
        throw new Error(`Unable to read commit metadata for ${ref}.`);
    }

    return commit;
}

function readCommitLog(
    repoRoot: string,
    args: readonly string[],
): CommitInfo[] {
    const output = readGit(repoRoot, [
        'log',
        `--format=${COMMIT_FORMAT}`,
        ...args,
    ]);

    if (output === '') {
        return [];
    }

    const commits: CommitInfo[] = [];

    for (const line of output.split('\n')) {
        commits.push(parseCommitLine(line));
    }

    return commits;
}

function parseCommitLine(line: string): CommitInfo {
    const [sha = '', dateIso = '', author = '', subject = ''] =
        line.split('\u001f');

    if (sha === '' || dateIso === '' || author === '') {
        throw new Error(`Unable to parse commit line: ${line}`);
    }

    return {
        author,
        dateIso,
        sha,
        shortSha: sha.slice(0, 7),
        subject,
    };
}

function readRecentCommits(repoRoot: string, ref: string): CommitInfo[] {
    return readCommitLog(repoRoot, ['-3', ref]);
}

function readBranchReflogAnalysis(
    repoRoot: string,
    baseRef: string,
    branch: string,
): ReflogAnalysis {
    if (isBranchSymbolicRef(repoRoot, branch)) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    const gitDirectories = readGitDirectories(repoRoot);

    if (gitDirectories === null) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    const parsedReflog = readReflogShas(
        join(gitDirectories.commonGitDir, 'logs', 'refs', 'heads', branch),
    );

    if (parsedReflog === null || parsedReflog.shas.length === 0) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    const uniqueCommitCount = countReflogOnlyCommits(
        repoRoot,
        baseRef,
        parsedReflog.shas,
    );

    if (uniqueCommitCount === null) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    return {
        available: true,
        fingerprint: parsedReflog.fingerprint,
        uniqueCommitCount,
    };
}

function readReflogShas(reflogPath: string): null | ParsedReflog {
    if (!existsSync(reflogPath)) {
        return null;
    }

    try {
        return parseReflogShas(readFileSync(reflogPath).toString('latin1'));
    } catch {
        return null;
    }
}

function parseReflogShas(reflogContent: string): null | ParsedReflog {
    const shas = new Set<string>();

    for (const line of reflogContent
        .split('\n')
        .filter((entry) => entry !== '')) {
        const parsedLine = parseReflogLineShas(line);

        if (parsedLine === null) {
            return null;
        }

        for (const sha of parsedLine) {
            shas.add(sha);
        }
    }

    return {
        content: reflogContent,
        fingerprint: stableHashByteString(reflogContent),
        shas: [...shas],
    };
}

function parseReflogLineShas(line: string): null | string[] {
    const [oldSha = '', newSha = ''] = line.split(' ', 3);

    if (!isReflogEntrySha(oldSha) || !isReflogEntrySha(newSha)) {
        return null;
    }

    return [oldSha, newSha].filter(isReflogSha);
}

function isReflogSha(sha: string): boolean {
    return isReflogEntrySha(sha) && !isZeroSha(sha);
}

function isReflogEntrySha(sha: string): boolean {
    return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(sha);
}

function isZeroSha(sha: string): boolean {
    return /^0+$/u.test(sha);
}

function countReflogOnlyCommits(
    repoRoot: string,
    baseRef: string,
    reflogShas: readonly string[],
): null | number {
    const uniqueCommitShas: string[] = [];

    for (const sha of reflogShas) {
        if (!gitSucceeded(repoRoot, ['cat-file', '-e', `${sha}^{commit}`])) {
            return null;
        }

        if (
            !gitSucceeded(repoRoot, [
                'merge-base',
                '--is-ancestor',
                sha,
                baseRef,
            ])
        ) {
            uniqueCommitShas.push(sha);
        }
    }

    return uniqueCommitShas.length;
}

function assessRemoteBranch(
    repoRoot: string,
    base: BaseRef,
    branch: string,
): null | RemoteBranchAssessment {
    const upstream = readUpstreamInfo(repoRoot, branch);

    if (upstream === null) {
        return assessBranchWithoutOriginUpstream(repoRoot, base, branch);
    }

    if (upstream.branch === '') {
        return buildIdentityUnverifiedRemoteBranch(upstream.shortName, branch);
    }

    if (upstream.remote !== 'origin') {
        return buildNonOriginRemoteBranch(upstream);
    }

    return buildOriginRemoteBranch(repoRoot, base, upstream);
}

function readUpstreamInfo(
    repoRoot: string,
    branch: string,
): null | UpstreamInfo {
    const output = readGit(repoRoot, [
        'for-each-ref',
        `refs/heads/${branch}`,
        '--format=%(upstream:remotename)%1f%(upstream:remoteref)%1f%(upstream:short)',
    ]);

    if (output === '') {
        return null;
    }

    const [remote = '', remoteRef = '', shortName = ''] =
        output.split('\u001f');

    if (remote === '' && remoteRef === '' && shortName === '') {
        return null;
    }

    const remoteBranch = remoteRef.startsWith('refs/heads/')
        ? remoteRef.slice('refs/heads/'.length)
        : '';

    return {
        branch: remoteBranch,
        remote,
        shortName: shortName === '' ? `${remote}/${remoteBranch}` : shortName,
    };
}

function assessBranchWithoutOriginUpstream(
    repoRoot: string,
    base: BaseRef,
    branch: string,
): RemoteBranchAssessment {
    const shortName = `origin/${branch}`;
    const localTrackingSha = readTrackedRemoteSha(repoRoot, shortName);
    const liveBranchProbe = readLiveOriginBranchProbe(repoRoot, branch);
    const liveSha =
        liveBranchProbe.kind === 'present' ? liveBranchProbe.sha : null;
    const status = readOriginRemoteBranchStatus(
        repoRoot,
        base,
        branch,
        shortName,
        liveBranchProbe,
        localTrackingSha,
    );
    const remoteSafetyProofFingerprint =
        status === 'safe' || status === 'absent'
            ? readRemoteSafetyProofFingerprint(
                  repoRoot,
                  base,
                  branch,
                  shortName,
                  localTrackingSha,
              )
            : null;
    const localTrackingProofFingerprint =
        status === 'safe' || status === 'absent'
            ? readSafeLocalTrackingProofFingerprint(
                  repoRoot,
                  base,
                  shortName,
                  localTrackingSha,
              )
            : null;

    return {
        branch,
        liveSha,
        localTrackingProofFingerprint,
        localTrackingSha,
        remote: 'origin',
        remoteSafetyProofFingerprint,
        shortName,
        status,
    };
}

function readLiveOriginBranchProbe(
    repoRoot: string,
    branch: string,
): LiveOriginBranchProbe {
    const output = tryGit(repoRoot, [
        'ls-remote',
        'origin',
        `refs/heads/${branch}`,
    ]);

    if (!output.ok) {
        return {
            error: output.error,
            kind: 'unverified',
        };
    }

    if (output.stdout === '') {
        return { kind: 'absent' };
    }

    const [sha = ''] = output.stdout.split('\t');

    return sha === ''
        ? {
              error: 'git ls-remote returned an empty SHA for the branch.',
              kind: 'unverified',
          }
        : {
              kind: 'present',
              sha,
          };
}

function readTrackedRemoteSha(
    repoRoot: string,
    shortName: string,
): null | string {
    const result = tryGit(repoRoot, [
        'rev-parse',
        '--verify',
        `refs/remotes/${shortName}^{commit}`,
    ]);

    return result.ok && result.stdout !== '' ? result.stdout : null;
}

function buildIdentityUnverifiedRemoteBranch(
    upstreamShort: string,
    branch: string,
): RemoteBranchAssessment {
    return {
        branch,
        liveSha: null,
        localTrackingProofFingerprint: null,
        localTrackingSha: null,
        remote: 'origin',
        remoteSafetyProofFingerprint: null,
        shortName: upstreamShort,
        status: 'identity_unverified',
    };
}

function buildNonOriginRemoteBranch(
    parsedRemote: UpstreamInfo,
): RemoteBranchAssessment {
    return {
        branch: parsedRemote.branch,
        liveSha: null,
        localTrackingProofFingerprint: null,
        localTrackingSha: null,
        remote: parsedRemote.remote,
        remoteSafetyProofFingerprint: null,
        shortName: parsedRemote.shortName,
        status: 'non_origin_upstream',
    };
}

function buildOriginRemoteBranch(
    repoRoot: string,
    base: BaseRef,
    parsedRemote: UpstreamInfo,
): RemoteBranchAssessment {
    const localTrackingSha = readTrackedRemoteSha(
        repoRoot,
        parsedRemote.shortName,
    );
    const liveBranchProbe = readLiveOriginBranchProbe(
        repoRoot,
        parsedRemote.branch,
    );
    const liveSha =
        liveBranchProbe.kind === 'present' ? liveBranchProbe.sha : null;
    const status = readOriginRemoteBranchStatus(
        repoRoot,
        base,
        parsedRemote.branch,
        parsedRemote.shortName,
        liveBranchProbe,
        localTrackingSha,
    );
    const remoteSafetyProofFingerprint =
        status === 'safe' || status === 'absent'
            ? readRemoteSafetyProofFingerprint(
                  repoRoot,
                  base,
                  parsedRemote.branch,
                  parsedRemote.shortName,
                  localTrackingSha,
              )
            : null;
    const localTrackingProofFingerprint =
        status === 'safe' || status === 'absent'
            ? readSafeLocalTrackingProofFingerprint(
                  repoRoot,
                  base,
                  parsedRemote.shortName,
                  localTrackingSha,
              )
            : null;

    return {
        branch: parsedRemote.branch,
        liveSha,
        localTrackingProofFingerprint,
        localTrackingSha,
        remote: parsedRemote.remote,
        remoteSafetyProofFingerprint,
        shortName: parsedRemote.shortName,
        status,
    };
}

function readOriginRemoteBranchStatus(
    repoRoot: string,
    base: BaseRef,
    branch: string,
    trackingShortName: string,
    liveBranchProbe: LiveOriginBranchProbe,
    localTrackingSha: null | string,
): RemoteBranchStatus {
    if (branch === base.branchName) {
        return readProtectedOriginBaseStatus(
            repoRoot,
            base,
            trackingShortName,
            liveBranchProbe,
        );
    }

    if (liveBranchProbe.kind === 'unverified') {
        return 'live_probe_unverified';
    }

    if (liveBranchProbe.kind === 'absent') {
        return readAbsentRemoteBranchStatus(
            repoRoot,
            base,
            trackingShortName,
            branch,
            localTrackingSha,
        );
    }

    return readPresentOriginRemoteBranchStatus(
        repoRoot,
        base,
        branch,
        trackingShortName,
        liveBranchProbe.sha,
        localTrackingSha,
    );
}

function readProtectedOriginBaseStatus(
    repoRoot: string,
    base: BaseRef,
    trackingShortName: string,
    liveBranchProbe: LiveOriginBranchProbe,
): RemoteBranchStatus {
    if (liveBranchProbe.kind === 'unverified') {
        return 'live_probe_unverified';
    }

    if (
        liveBranchProbe.kind === 'absent' ||
        liveBranchProbe.sha !== base.liveSha
    ) {
        return 'live_tip_unverified';
    }

    if (resolveLocalGitRemotePath(repoRoot, base.remoteUrl) !== null) {
        const remoteHistoryStatus = readRemoteBranchHistoryStatus(
            repoRoot,
            base,
        );

        if (remoteHistoryStatus !== 'safe') {
            return remoteHistoryStatus;
        }
    }

    const trackingStatus = readLocalTrackingRefStatus(
        repoRoot,
        base,
        trackingShortName,
        liveBranchProbe.sha,
    );

    if (trackingStatus !== 'safe') {
        return trackingStatus;
    }

    return 'protected_base';
}

function readPresentOriginRemoteBranchStatus(
    repoRoot: string,
    base: BaseRef,
    branch: string,
    trackingShortName: string,
    liveSha: string,
    localTrackingSha: null | string,
): RemoteBranchStatus {
    const liveTipStatus = readPresentOriginLiveTipStatus(
        repoRoot,
        base,
        branch,
        liveSha,
        localTrackingSha,
    );

    if (liveTipStatus !== 'safe') {
        return liveTipStatus;
    }

    const trackingIdentityStatus = readLocalTrackingRefIdentityStatus(
        repoRoot,
        trackingShortName,
        liveSha,
    );

    if (trackingIdentityStatus !== 'safe') {
        return trackingIdentityStatus;
    }

    if (!originGitDirectoryIsLocallyInspectable(repoRoot, base)) {
        return 'safe';
    }

    return readInspectablePresentOriginRemoteBranchStatus(
        repoRoot,
        base,
        branch,
        trackingShortName,
        liveSha,
    );
}

function readInspectablePresentOriginRemoteBranchStatus(
    repoRoot: string,
    base: BaseRef,
    branch: string,
    trackingShortName: string,
    liveSha: string,
): RemoteBranchStatus {
    const trackingStatus = readLocalTrackingRefStatus(
        repoRoot,
        base,
        trackingShortName,
        liveSha,
    );

    if (trackingStatus !== 'safe') {
        return trackingStatus;
    }

    const worktreeStatus = readOriginCheckedOutWorktreeStatus(
        repoRoot,
        base,
        branch,
    );

    if (worktreeStatus !== 'safe') {
        return worktreeStatus;
    }

    const remoteHistoryStatus = readRemoteBranchHistoryStatus(repoRoot, base);

    if (remoteHistoryStatus !== 'safe') {
        return remoteHistoryStatus;
    }

    return readRemoteBranchReflogStatus(repoRoot, base, branch);
}

function readPresentOriginLiveTipStatus(
    repoRoot: string,
    base: BaseRef,
    branch: string,
    liveSha: string,
    localTrackingSha: null | string,
): Extract<
    RemoteBranchStatus,
    | 'identity_unverified'
    | 'live_tip_not_on_base'
    | 'live_tip_unverified'
    | 'safe'
> {
    if (isLocalOriginBranchSymbolicRef(repoRoot, base, branch)) {
        return 'identity_unverified';
    }

    if (localTrackingSha === null || localTrackingSha !== liveSha) {
        return 'live_tip_unverified';
    }

    return gitSucceeded(repoRoot, [
        'merge-base',
        '--is-ancestor',
        liveSha,
        base.liveSha,
    ])
        ? 'safe'
        : 'live_tip_not_on_base';
}

function readLocalTrackingRefIdentityStatus(
    repoRoot: string,
    trackingShortName: string,
    expectedSha: string,
): Extract<
    RemoteBranchStatus,
    'identity_unverified' | 'live_tip_unverified' | 'safe'
> {
    const trackingRef = `refs/remotes/${trackingShortName}`;

    if (isSymbolicRef(repoRoot, trackingRef)) {
        return 'identity_unverified';
    }

    return readRefCommitSha(repoRoot, trackingRef) === expectedSha
        ? 'safe'
        : 'live_tip_unverified';
}

function originGitDirectoryIsLocallyInspectable(
    repoRoot: string,
    base: BaseRef,
): boolean {
    return resolveLocalGitRemotePath(repoRoot, base.remoteUrl) !== null;
}

function readLocalTrackingRefStatus(
    repoRoot: string,
    base: BaseRef,
    trackingShortName: string,
    expectedSha: string,
): LocalTrackingRefProofStatus {
    const proof = readLocalTrackingRefProof(
        repoRoot,
        base,
        trackingShortName,
        expectedSha,
    );

    return proof.status;
}

function readLocalTrackingRefProof(
    repoRoot: string,
    base: BaseRef,
    trackingShortName: string,
    expectedSha: string,
): {
    fingerprint: null | string;
    status: LocalTrackingRefProofStatus;
} {
    const trackingRef = `refs/remotes/${trackingShortName}`;

    if (isSymbolicRef(repoRoot, trackingRef)) {
        return {
            fingerprint: null,
            status: 'identity_unverified',
        };
    }

    if (readRefCommitSha(repoRoot, trackingRef) !== expectedSha) {
        return {
            fingerprint: null,
            status: 'live_tip_unverified',
        };
    }

    const gitDirectories = readGitDirectories(repoRoot);

    if (gitDirectories === null) {
        return {
            fingerprint: null,
            status: 'history_unverified',
        };
    }

    const parsedReflog = readReflogShas(
        join(
            gitDirectories.commonGitDir,
            'logs',
            'refs',
            'remotes',
            ...trackingShortName.split('/'),
        ),
    );

    if (parsedReflog === null || parsedReflog.shas.length === 0) {
        return {
            fingerprint: null,
            status: 'history_unverified',
        };
    }

    const uniqueCommitCount = countReflogOnlyCommits(
        repoRoot,
        base.liveSha,
        parsedReflog.shas,
    );

    if (uniqueCommitCount === null) {
        return {
            fingerprint: null,
            status: 'history_unverified',
        };
    }

    return uniqueCommitCount > 0
        ? {
              fingerprint: parsedReflog.fingerprint,
              status: 'tracking_ref_not_on_base',
          }
        : {
              fingerprint: parsedReflog.fingerprint,
              status: 'safe',
          };
}

function isLocalOriginBranchSymbolicRef(
    repoRoot: string,
    base: BaseRef,
    branch: string,
): boolean {
    const remoteRepoPath = resolveLocalGitRemotePath(repoRoot, base.remoteUrl);

    return (
        remoteRepoPath !== null && isBranchSymbolicRef(remoteRepoPath, branch)
    );
}

function readRemoteBranchHistoryStatus(
    repoRoot: string,
    base: BaseRef,
): Extract<
    RemoteBranchStatus,
    'history_not_on_base' | 'history_unverified' | 'safe'
> {
    const inspection = readRemoteHistoryInspection(repoRoot, base);

    return inspection.status === 'ready' ? 'safe' : inspection.status;
}

function readRemoteBranchReflogStatus(
    repoRoot: string,
    base: BaseRef,
    branch: string,
): Extract<
    RemoteBranchStatus,
    'history_not_on_base' | 'history_unverified' | 'safe'
> {
    const inspection = readRemoteHistoryInspection(repoRoot, base);

    if (inspection.status !== 'ready') {
        return inspection.status;
    }

    const branchReflogProof = readRemoteBranchReflogProof(
        inspection,
        base,
        branch,
    );

    return branchReflogProof.status;
}

function readOriginCheckedOutWorktreeStatus(
    repoRoot: string,
    base: BaseRef,
    branch: string,
): Extract<
    RemoteBranchStatus,
    'checked_out_in_origin_worktree' | 'history_unverified' | 'safe'
> {
    const remoteRepoPath = resolveLocalGitRemotePath(repoRoot, base.remoteUrl);

    if (remoteRepoPath === null) {
        return 'history_unverified';
    }

    try {
        return listWorktrees(remoteRepoPath).some((worktree) =>
            isOriginWorktreeBlockingBranchDeletion(worktree, branch),
        )
            ? 'checked_out_in_origin_worktree'
            : 'safe';
    } catch {
        return 'history_unverified';
    }
}

function readAbsentRemoteBranchStatus(
    repoRoot: string,
    base: BaseRef,
    trackingShortName: string,
    branch: string,
    localTrackingSha: null | string,
): Extract<
    RemoteBranchStatus,
    | 'absent'
    | 'history_not_on_base'
    | 'history_unverified'
    | 'tracking_ref_not_on_base'
> {
    if (
        localTrackingSha !== null &&
        !gitSucceeded(repoRoot, [
            'merge-base',
            '--is-ancestor',
            localTrackingSha,
            base.liveSha,
        ])
    ) {
        return 'tracking_ref_not_on_base';
    }

    if (!originGitDirectoryIsLocallyInspectable(repoRoot, base)) {
        return 'absent';
    }

    if (readTrackedRemoteSha(repoRoot, trackingShortName) === null) {
        return 'absent';
    }

    const inspection = readRemoteHistoryInspection(repoRoot, base);

    if (inspection.status !== 'ready') {
        return inspection.status;
    }

    const branchReflogProof = readRemoteBranchReflogProof(
        inspection,
        base,
        branch,
    );

    return branchReflogProof.status === 'safe'
        ? 'absent'
        : branchReflogProof.status;
}

function readRemoteBranchReflogProof(
    inspection: {
        gitDirectories: GitDirectories;
        remoteRepoPath: string;
        status: 'ready';
    },
    base: BaseRef,
    branch: string,
): RemoteBranchReflogProof {
    const branchReflog = readReflogShas(
        join(
            inspection.gitDirectories.commonGitDir,
            'logs',
            'refs',
            'heads',
            branch,
        ),
    );

    if (branchReflog === null || branchReflog.shas.length === 0) {
        return {
            fingerprint: null,
            status: 'history_unverified',
        };
    }

    const branchUniqueCommitCount = countReflogOnlyCommits(
        inspection.remoteRepoPath,
        base.liveSha,
        branchReflog.shas,
    );

    if (branchUniqueCommitCount === null) {
        return {
            fingerprint: null,
            status: 'history_unverified',
        };
    }

    if (branchUniqueCommitCount > 0) {
        return {
            fingerprint: branchReflog.fingerprint,
            status: 'history_not_on_base',
        };
    }

    return {
        fingerprint: branchReflog.fingerprint,
        status: 'safe',
    };
}

function readRemoteHistoryInspection(
    repoRoot: string,
    base: BaseRef,
):
    | {
          gitDirectories: GitDirectories;
          proofFingerprint: string;
          remoteRepoPath: string;
          status: 'ready';
      }
    | {
          status: 'history_not_on_base' | 'history_unverified';
      } {
    const remoteRepoPath = resolveLocalGitRemotePath(repoRoot, base.remoteUrl);

    if (
        remoteRepoPath === null ||
        readHistoryRewriteOverlayIssue(remoteRepoPath) !== null
    ) {
        return { status: 'history_unverified' };
    }

    return readVerifiedRemoteHistoryInspection(remoteRepoPath, base);
}

function readVerifiedRemoteHistoryInspection(
    remoteRepoPath: string,
    base: BaseRef,
):
    | {
          gitDirectories: GitDirectories;
          proofFingerprint: string;
          remoteRepoPath: string;
          status: 'ready';
      }
    | {
          status: 'history_not_on_base' | 'history_unverified';
      } {
    const remoteHistoryAnalyses = readRemoteHistoryAnalyses(
        remoteRepoPath,
        base.branchName,
        base.liveSha,
    );

    if (remoteHistoryAnalyses.status !== 'ready') {
        return remoteHistoryAnalyses;
    }

    return {
        gitDirectories: remoteHistoryAnalyses.gitDirectories,
        proofFingerprint: stableHash(
            JSON.stringify({
                hiddenRefFingerprint:
                    remoteHistoryAnalyses.hiddenRefAnalysis.fingerprint,
                remoteBaseBranchName: base.branchName,
                remoteRepoPath,
                repositoryReflogFingerprint:
                    remoteHistoryAnalyses.repositoryReflogAnalysis.fingerprint,
                repositoryUnreachableFingerprint:
                    remoteHistoryAnalyses.unreachableCommitAnalysis.fingerprint,
            }),
        ),
        remoteRepoPath,
        status: 'ready',
    };
}

function readRemoteHistoryAnalyses(
    remoteRepoPath: string,
    baseBranchName: string,
    baseSha: string,
):
    | {
          gitDirectories: GitDirectories;
          hiddenRefAnalysis: HiddenRefAnalysis;
          repositoryReflogAnalysis: ReflogAnalysis;
          status: 'ready';
          unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis;
      }
    | {
          status: 'history_not_on_base' | 'history_unverified';
      } {
    const gitDirectoriesAndHiddenRefAnalysis =
        readRemoteGitDirectoriesAndHiddenRefAnalysis(remoteRepoPath, baseSha);

    if (gitDirectoriesAndHiddenRefAnalysis.status !== 'ready') {
        return gitDirectoriesAndHiddenRefAnalysis;
    }

    const worktrees = readWorktreesSafely(remoteRepoPath);

    if (
        worktrees === null ||
        readRepositoryLinkedWorktreePaths(worktrees).length > 0 ||
        readRepositoryDirtyWorktrees(worktrees).length > 0
    ) {
        return { status: 'history_unverified' };
    }

    const historyRetentionAnalyses = readRemoteHistoryRetentionAnalyses(
        remoteRepoPath,
        baseSha,
    );

    if (historyRetentionAnalyses.status !== 'ready') {
        return historyRetentionAnalyses;
    }

    return {
        gitDirectories: gitDirectoriesAndHiddenRefAnalysis.gitDirectories,
        hiddenRefAnalysis: gitDirectoriesAndHiddenRefAnalysis.hiddenRefAnalysis,
        repositoryReflogAnalysis:
            historyRetentionAnalyses.repositoryReflogAnalysis,
        status: 'ready',
        unreachableCommitAnalysis:
            historyRetentionAnalyses.unreachableCommitAnalysis,
    };
}

function readRemoteGitDirectoriesAndHiddenRefAnalysis(
    remoteRepoPath: string,
    baseSha: string,
):
    | {
          gitDirectories: GitDirectories;
          hiddenRefAnalysis: HiddenRefAnalysis;
          status: 'ready';
      }
    | {
          status: 'history_not_on_base' | 'history_unverified';
      } {
    const gitDirectories = readGitDirectories(remoteRepoPath);

    if (gitDirectories === null) {
        return { status: 'history_unverified' };
    }

    const hiddenRefAnalysis = readReachableHiddenRefAnalysis(
        remoteRepoPath,
        baseSha,
    );

    if (!hiddenRefAnalysis.available) {
        return { status: 'history_unverified' };
    }

    return hiddenRefAnalysis.refs.length > 0
        ? { status: 'history_not_on_base' }
        : {
              gitDirectories,
              hiddenRefAnalysis,
              status: 'ready',
          };
}

function readRemoteHistoryRetentionAnalyses(
    remoteRepoPath: string,
    baseSha: string,
):
    | {
          repositoryReflogAnalysis: ReflogAnalysis;
          status: 'ready';
          unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis;
      }
    | {
          status: 'history_not_on_base' | 'history_unverified';
      } {
    const unreachableCommitAnalysis =
        readRepositoryUnreachableCommitAnalysis(remoteRepoPath);

    if (!unreachableCommitAnalysis.available) {
        return { status: 'history_unverified' };
    }

    if (unreachableCommitAnalysis.commitCount > 0) {
        return { status: 'history_not_on_base' };
    }

    const repositoryReflogAnalysis = readRepositoryReflogAnalysis(
        remoteRepoPath,
        baseSha,
    );

    if (!repositoryReflogAnalysis.available) {
        return { status: 'history_unverified' };
    }

    return repositoryReflogAnalysis.uniqueCommitCount > 0
        ? { status: 'history_not_on_base' }
        : {
              repositoryReflogAnalysis,
              status: 'ready',
              unreachableCommitAnalysis,
          };
}

function readRemoteSafetyProofFingerprint(
    repoRoot: string,
    base: BaseRef,
    branch: string,
    trackingShortName: string,
    localTrackingSha: null | string,
): null | string {
    const inspection = readRemoteHistoryInspection(repoRoot, base);

    if (inspection.status !== 'ready') {
        return null;
    }

    const branchReflogProof = readRemoteBranchReflogProof(
        inspection,
        base,
        branch,
    );
    const trackingRefProof = readOptionalLocalTrackingRefProof(
        repoRoot,
        base,
        trackingShortName,
        localTrackingSha,
    );

    return readSafeRemoteProofFingerprint(
        branchReflogProof,
        inspection.proofFingerprint,
        trackingRefProof,
    );
}

function readOptionalLocalTrackingRefProof(
    repoRoot: string,
    base: BaseRef,
    trackingShortName: string,
    localTrackingSha: null | string,
): null | ReturnType<typeof readLocalTrackingRefProof> {
    return localTrackingSha === null
        ? null
        : readLocalTrackingRefProof(
              repoRoot,
              base,
              trackingShortName,
              localTrackingSha,
          );
}

function readSafeLocalTrackingProofFingerprint(
    repoRoot: string,
    base: BaseRef,
    trackingShortName: string,
    localTrackingSha: null | string,
): null | string {
    const proof = readOptionalLocalTrackingRefProof(
        repoRoot,
        base,
        trackingShortName,
        localTrackingSha,
    );

    return proof?.status === 'safe' ? proof.fingerprint : null;
}

function readSafeRemoteProofFingerprint(
    branchReflogProof: RemoteBranchReflogProof,
    remoteHistoryFingerprint: string,
    trackingRefProof: null | ReturnType<typeof readLocalTrackingRefProof>,
): null | string {
    if (!remoteProofComponentsAreSafe(branchReflogProof, trackingRefProof)) {
        return null;
    }

    return stableHash(
        JSON.stringify({
            branchReflogFingerprint: branchReflogProof.fingerprint,
            remoteHistoryFingerprint,
            trackingRefFingerprint: trackingRefProof?.fingerprint ?? null,
        }),
    );
}

function remoteProofComponentsAreSafe(
    branchReflogProof: RemoteBranchReflogProof,
    trackingRefProof: null | ReturnType<typeof readLocalTrackingRefProof>,
): boolean {
    return (
        branchReflogProof.status === 'safe' &&
        branchReflogProof.fingerprint !== null &&
        (trackingRefProof === null ||
            (trackingRefProof.status === 'safe' &&
                trackingRefProof.fingerprint !== null))
    );
}

function resolveLocalGitRemotePath(
    repoRoot: string,
    remoteUrl: string,
): null | string {
    if (remoteUrl.startsWith('file://')) {
        try {
            return fileURLToPath(remoteUrl);
        } catch {
            return null;
        }
    }

    if (
        remoteUrl.startsWith('/') ||
        remoteUrl.startsWith('./') ||
        remoteUrl.startsWith('../')
    ) {
        return remoteUrl.startsWith('/')
            ? remoteUrl
            : resolve(repoRoot, remoteUrl);
    }

    return null;
}

function buildBranchState(
    repoRoot: string,
    baseRef: string,
    branch: string,
    linkedWorktrees: readonly WorktreeInfo[],
    worktrees: readonly WorktreeInfo[],
    hasCommonAncestor: boolean,
    uniqueCommitCount: number,
    branchReflogAnalysis: ReflogAnalysis,
    detachedWorktrees: readonly DetachedWorktreeReport[],
    hiddenRefAnalysis: HiddenRefAnalysis,
    repositoryReflogAnalysis: ReflogAnalysis,
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
    remoteBranch: null | RemoteBranchAssessment,
): BranchState {
    const aheadBehind = readAheadBehind(repoRoot, baseRef, branch);
    const linkedWorktreeFlags = readLinkedWorktreeFlags(linkedWorktrees);
    const repositoryDirtyWorktrees = readRepositoryDirtyWorktrees(worktrees);
    const mergedByHistory = gitSucceeded(repoRoot, [
        'merge-base',
        '--is-ancestor',
        branch,
        baseRef,
    ]);
    const originBranchStatus = remoteBranch?.status ?? 'absent';
    const hasBlockingDetachedWorktree = detachedWorktrees.some(
        (worktree) => !worktree.state.safeToRemoveManually,
    );
    const repositoryLinkedWorktreePaths =
        readRepositoryLinkedWorktreePaths(worktrees);
    const safeToDelete = isBranchSafeToDelete(
        branch,
        branchReflogAnalysis,
        linkedWorktreeFlags,
        mergedByHistory,
        linkedWorktrees.length,
        remoteBranch,
    );
    const safetyProofFingerprint = buildBranchSafetyProofFingerprint(
        branch,
        branchReflogAnalysis,
        linkedWorktreeFlags,
        mergedByHistory,
        linkedWorktrees.length,
        remoteBranch,
    );

    return {
        aheadCount: aheadBehind.aheadCount,
        behindCount: aheadBehind.behindCount,
        branchReflogAvailable: branchReflogAnalysis.available,
        branchReflogUniqueCommitCount: branchReflogAnalysis.uniqueCommitCount,
        branchTipOnBase: mergedByHistory,
        hasBlockingDetachedWorktree,
        hasCommonAncestor,
        hasDirtyWorktree: linkedWorktreeFlags.hasDirtyWorktree,
        hasMissingWorktree: linkedWorktreeFlags.hasMissingWorktree,
        hasPrimaryWorktree: linkedWorktreeFlags.hasPrimaryWorktree,
        hasPrunableWorktree: linkedWorktreeFlags.hasPrunableWorktree,
        linkedWorktreeCount: linkedWorktrees.length,
        mergedByHistory,
        originBranchStatus,
        repositoryHiddenRefCount: hiddenRefAnalysis.refs.length,
        repositoryHiddenRefs: hiddenRefAnalysis.refs,
        repositoryHiddenRefsAvailable: hiddenRefAnalysis.available,
        repositoryLinkedWorktreeCount: repositoryLinkedWorktreePaths.length,
        repositoryLinkedWorktreePaths,
        repositoryReflogAvailable: repositoryReflogAnalysis.available,
        repositoryReflogUniqueCommitCount:
            repositoryReflogAnalysis.uniqueCommitCount,
        repositoryUnreachableCommitCount: unreachableCommitAnalysis.commitCount,
        repositoryUnreachableCommitsAvailable:
            unreachableCommitAnalysis.available,
        repositoryWorktreeDirtyCount: repositoryDirtyWorktrees.length,
        repositoryWorktreeDirtyPaths: repositoryDirtyWorktrees.map(
            (worktree) => worktree.path,
        ),
        safeToDelete,
        safetyProofFingerprint,
        uniqueCommitCount,
    };
}

function buildBranchSafetyProofFingerprint(
    branch: string,
    branchReflogAnalysis: ReflogAnalysis,
    linkedWorktreeFlags: ReturnType<typeof readLinkedWorktreeFlags>,
    mergedByHistory: boolean,
    linkedWorktreeCount: number,
    remoteBranch: null | RemoteBranchAssessment,
): null | string {
    if (branchReflogAnalysis.fingerprint === null) {
        return null;
    }

    return stableHash(
        JSON.stringify({
            branch,
            branchReflogFingerprint: branchReflogAnalysis.fingerprint,
            linkedWorktreeCount,
            linkedWorktreeFlags,
            mergedByHistory,
            remoteBranch,
        }),
    );
}

function readAheadBehind(
    repoRoot: string,
    baseRef: string,
    branch: string,
): Pick<BranchState, 'aheadCount' | 'behindCount'> {
    const [behindCount, aheadCount] = readGit(repoRoot, [
        'rev-list',
        '--left-right',
        '--count',
        `${baseRef}...${branch}`,
    ])
        .split(/\s+/u)
        .map((value) => Number.parseInt(value, 10));

    if (Number.isNaN(aheadCount) || Number.isNaN(behindCount)) {
        throw new Error(`Unable to parse ahead/behind counts for ${branch}.`);
    }

    return {
        aheadCount,
        behindCount,
    };
}

function readLinkedWorktreeFlags(linkedWorktrees: readonly WorktreeInfo[]): {
    hasDirtyWorktree: boolean;
    hasMissingWorktree: boolean;
    hasPrimaryWorktree: boolean;
    hasPrunableWorktree: boolean;
} {
    return {
        hasDirtyWorktree: linkedWorktrees.some(
            (worktree) => worktree.state === 'dirty',
        ),
        hasMissingWorktree: linkedWorktrees.some(
            (worktree) => worktree.state === 'missing',
        ),
        hasPrimaryWorktree: linkedWorktrees.some(
            (worktree) => worktree.isPrimary,
        ),
        hasPrunableWorktree: linkedWorktrees.some(
            (worktree) => worktree.state === 'prunable',
        ),
    };
}

function readRepositoryDirtyWorktrees(
    worktrees: readonly WorktreeInfo[],
): WorktreeInfo[] {
    return worktrees.filter((worktree) => worktree.state !== 'clean');
}

function isOriginWorktreeBlockingBranchDeletion(
    worktree: WorktreeInfo,
    branch: string,
): boolean {
    return (
        worktree.branchName === branch ||
        !worktree.isPrimary ||
        worktree.state !== 'clean' ||
        (!worktree.bare && worktree.branchName === null)
    );
}

function readRepositoryLinkedWorktreePaths(
    worktrees: readonly WorktreeInfo[],
): string[] {
    return worktrees
        .filter((worktree) => !worktree.isPrimary)
        .map((worktree) => worktree.path);
}

function readWorktreesSafely(repoPath: string): null | WorktreeInfo[] {
    try {
        return listWorktrees(repoPath);
    } catch {
        return null;
    }
}

function isBranchSafeToDelete(
    branch: string,
    branchReflogAnalysis: ReflogAnalysis,
    linkedWorktreeFlags: ReturnType<typeof readLinkedWorktreeFlags>,
    mergedByHistory: boolean,
    linkedWorktreeCount: number,
    remoteBranch: null | RemoteBranchAssessment,
): boolean {
    return (
        mergedByHistory &&
        branchHasNoUniqueReflogCommits(branchReflogAnalysis) &&
        isRemoteBranchSafeToDelete(branch, remoteBranch) &&
        hasNoBlockingLinkedWorktrees(linkedWorktreeCount, linkedWorktreeFlags)
    );
}

function branchHasNoUniqueReflogCommits(
    branchReflogAnalysis: ReflogAnalysis,
): boolean {
    return (
        branchReflogAnalysis.available &&
        branchReflogAnalysis.uniqueCommitCount === 0
    );
}

function hasNoBlockingLinkedWorktrees(
    linkedWorktreeCount: number,
    linkedWorktreeFlags: ReturnType<typeof readLinkedWorktreeFlags>,
): boolean {
    return (
        linkedWorktreeCount === 0 &&
        !linkedWorktreeFlags.hasPrimaryWorktree &&
        !linkedWorktreeFlags.hasDirtyWorktree &&
        !linkedWorktreeFlags.hasMissingWorktree &&
        !linkedWorktreeFlags.hasPrunableWorktree
    );
}

function isRemoteBranchSafeToDelete(
    branch: string,
    remoteBranch: null | RemoteBranchAssessment,
): boolean {
    if (remoteBranch === null) {
        return true;
    }

    return remoteBranch.status === 'absent'
        ? isAbsentRemoteBranchSafe(branch, remoteBranch)
        : isLiveRemoteBranchSafe(branch, remoteBranch);
}

function isAbsentRemoteBranchSafe(
    branch: string,
    remoteBranch: RemoteBranchAssessment,
): boolean {
    return remoteBranch.remote === 'origin' && remoteBranch.branch === branch;
}

function isLiveRemoteBranchSafe(
    branch: string,
    remoteBranch: RemoteBranchAssessment,
): boolean {
    return (
        remoteBranch.status === 'safe' &&
        remoteBranch.remote === 'origin' &&
        remoteBranch.branch === branch &&
        remoteBranch.liveSha !== null &&
        remoteBranch.localTrackingSha === remoteBranch.liveSha
    );
}

function summarizeBranchActivity(
    baseShort: string,
    lastCommit: CommitInfo,
    state: BranchState,
): string {
    const latestCommit = `${lastCommit.shortSha} by ${lastCommit.author}: ${lastCommit.subject}`;

    if (!state.hasCommonAncestor) {
        return `the branch does not share a common ancestor with ${baseShort}; latest commit is ${latestCommit} from ${lastCommit.dateIso.slice(0, 10)}.`;
    }

    if (state.branchTipOnBase) {
        return `the branch tip is already reachable from ${baseShort}; latest commit is ${latestCommit} from ${lastCommit.dateIso.slice(0, 10)}.`;
    }

    return `${state.uniqueCommitCount} commit(s) are still not reachable from ${baseShort}; latest commit is ${latestCommit} from ${lastCommit.dateIso.slice(0, 10)}.`;
}

function buildDeleteCommands(
    branch: string,
    _linkedWorktrees: readonly WorktreeInfo[],
    remoteBranch: null | RemoteBranchAssessment,
    state: BranchState,
): string[] {
    if (!state.safeToDelete) {
        return [];
    }

    const commands = [
        `slop-refinery git-cleanup --apply # revalidate and archive ${shellQuote(branch)} safely`,
    ];

    if (remoteBranch !== null) {
        if (remoteBranch.status === 'absent') {
            return commands;
        }

        if (
            !isRemoteBranchSafeToDelete(branch, remoteBranch) ||
            remoteBranch.liveSha === null
        ) {
            commands.push(
                `manual review required before deleting remote branch ${shellQuote(remoteBranch.shortName)}`,
            );
        }
    }

    return commands;
}

function canAutoRemoveWorktree(_worktree: WorktreeInfo): boolean {
    return false;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function readWorktreeBackupPath(worktreePath: string): string {
    const randomSuffix = Math.random()
        .toString(16)
        .slice(2, 2 + BACKUP_SUFFIX_LENGTH);
    return `${worktreePath}.git-cleanup-backup-${buildBackupStamp()}-${randomSuffix}`;
}

function buildBackupStamp(): string {
    return new Date()
        .toISOString()
        .replaceAll(':', '')
        .replaceAll('.', '')
        .replace('T', '-')
        .replace('Z', '');
}

function buildArchiveBranchName(
    scope: 'local' | 'remote',
    branch: string,
    liveSha: string,
): string {
    const randomSuffix = Math.random()
        .toString(16)
        .slice(2, 2 + BACKUP_SUFFIX_LENGTH);

    return `${GIT_CLEANUP_ARCHIVE_BRANCH_PREFIX}/${scope}/${branch}/${buildBackupStamp()}-${liveSha.slice(0, 12)}-${randomSuffix}`;
}

function buildArchiveBranchRef(
    scope: 'local' | 'remote',
    branch: string,
    liveSha: string,
): string {
    return `refs/heads/${buildArchiveBranchName(scope, branch, liveSha)}`;
}

function decideBranchOpinion(
    branch: string,
    lastCommit: CommitInfo,
    state: BranchState,
): Opinion {
    if (state.safeToDelete) {
        return {
            code: 'delete',
            label: 'delete',
            reason: 'the local branch and any auto-deleteable origin branch are proven preserved on the canonical origin default branch, and the branch is not checked out in any worktree.',
        };
    }

    if (isKeptOnlyByProofGaps(state)) {
        return {
            code: 'keep_for_review',
            label: 'keep for review',
            reason: 'the branch tip is already on the canonical base, but the remaining local safety proof is not clean enough for automatic deletion.',
        };
    }

    if (
        !state.branchTipOnBase &&
        looksLikeTemporaryBranch(
            branch,
            lastCommit.dateIso,
            state.uniqueCommitCount,
        )
    ) {
        return {
            code: 'probably_keep',
            label: 'probably keep',
            reason: 'the branch name looks temporary, but its tip is not proven merged into the canonical origin default branch.',
        };
    }

    return {
        code: 'needs_human_review',
        label: 'needs human review',
        reason: 'git-cleanup cannot prove that every reachable or reflog-only commit is already preserved on origin’s canonical default branch.',
    };
}

function isKeptOnlyByProofGaps(state: BranchState): boolean {
    return (
        state.branchTipOnBase &&
        state.branchReflogAvailable &&
        state.branchReflogUniqueCommitCount === 0 &&
        !state.safeToDelete
    );
}

function looksLikeTemporaryBranch(
    branch: string,
    dateIso: string,
    uniqueCommitCount: number,
): boolean {
    return (
        TEMP_BRANCH_PATTERN.test(branch) &&
        uniqueCommitCount <= 2 &&
        getAgeInDays(dateIso) >= 14
    );
}

function getAgeInDays(dateIso: string): number {
    const dayInMilliseconds = 24 * 60 * 60 * 1000;
    return Math.floor((Date.now() - Date.parse(dateIso)) / dayInMilliseconds);
}

function collectBranchReasonCodes(
    branch: string,
    state: BranchState,
    remoteBranch: null | RemoteBranchAssessment,
): BranchReasonCode[] {
    return [
        state.branchTipOnBase ? 'branch_tip_on_base' : 'branch_tip_not_on_base',
        ...readBranchReflogReasonCodes(state),
        ...(state.hasBlockingDetachedWorktree
            ? (['detached_worktree_requires_manual_review'] as const)
            : []),
        ...readOriginBranchReasonCodes(
            branch,
            remoteBranch,
            state.originBranchStatus,
        ),
        ...readLinkedWorktreeReasonCodes(state),
    ];
}

function readBranchReflogReasonCodes(state: BranchState): BranchReasonCode[] {
    return [
        ...(state.branchReflogAvailable
            ? []
            : (['branch_reflog_unavailable'] as const)),
        ...(state.branchReflogUniqueCommitCount > 0
            ? (['branch_reflog_has_unique_commits'] as const)
            : []),
    ];
}

function readOriginBranchReasonCodes(
    branch: string,
    remoteBranch: null | RemoteBranchAssessment,
    status: RemoteBranchStatus,
): BranchReasonCode[] {
    const reasonCode = readOriginBranchReasonCode(status);
    const targetMismatchReasonCode: BranchReasonCode | null =
        (status === 'safe' || status === 'absent') &&
        remoteBranch !== null &&
        remoteBranch.branch !== branch
            ? 'origin_branch_delete_target_mismatch'
            : null;

    return [
        ...(targetMismatchReasonCode === null
            ? []
            : [targetMismatchReasonCode]),
        ...(reasonCode === null ? [] : [reasonCode]),
    ];
}

function readOriginBranchReasonCode(
    status: RemoteBranchStatus,
): BranchReasonCode | null {
    const reasonCodesByStatus: Record<
        Exclude<RemoteBranchStatus, 'safe'>,
        BranchReasonCode
    > = {
        absent: 'origin_branch_absent',
        checked_out_in_origin_worktree:
            'origin_branch_checked_out_in_origin_worktree',
        history_not_on_base: 'origin_branch_history_not_on_base',
        history_unverified: 'origin_branch_history_unverified',
        identity_unverified: 'origin_branch_identity_unverified',
        live_probe_unverified: 'origin_branch_live_probe_unverified',
        live_tip_not_on_base: 'origin_branch_live_tip_not_on_base',
        live_tip_unverified: 'origin_branch_live_tip_unverified',
        non_origin_upstream: 'origin_branch_non_origin_upstream',
        protected_base: 'origin_branch_protected_base',
        tracking_ref_not_on_base: 'origin_branch_tracking_ref_not_on_base',
    };

    return status === 'safe' ? null : reasonCodesByStatus[status];
}

function readLinkedWorktreeReasonCodes(state: BranchState): BranchReasonCode[] {
    const reasonCodes =
        state.linkedWorktreeCount === 0
            ? (['no_linked_worktrees'] as const)
            : (['linked_worktrees_require_manual_review'] as const);

    return [...reasonCodes, ...collectBlockingLinkedWorktreeReasonCodes(state)];
}

function collectBlockingLinkedWorktreeReasonCodes(
    state: BranchState,
): BranchReasonCode[] {
    return [
        state.hasPrimaryWorktree
            ? 'branch_checked_out_in_primary_worktree'
            : null,
        state.hasDirtyWorktree ? 'linked_worktree_dirty' : null,
        state.hasMissingWorktree ? 'linked_worktree_missing' : null,
        state.hasPrunableWorktree ? 'linked_worktree_prunable' : null,
    ].filter(
        (reasonCode): reasonCode is BranchReasonCode => reasonCode !== null,
    );
}

function buildBranchReasonDetails(
    branch: string,
    baseShort: string,
    linkedWorktrees: readonly WorktreeInfo[],
    detachedWorktrees: readonly DetachedWorktreeReport[],
    state: BranchState,
    remoteBranch: null | RemoteBranchAssessment,
): string[] {
    return [
        ...readBranchTipReasonDetails(baseShort, state),
        ...buildBranchReflogReasonDetails(baseShort, state),
        ...buildDetachedWorktreeBlockingReasonDetails(detachedWorktrees),
        ...buildRemoteReasonDetails(
            branch,
            baseShort,
            remoteBranch,
            state.originBranchStatus,
        ),
        ...buildLinkedWorktreeReasonDetails(linkedWorktrees, state),
    ];
}

function buildDetachedWorktreeBlockingReasonDetails(
    detachedWorktrees: readonly DetachedWorktreeReport[],
): string[] {
    const blockingWorktrees = detachedWorktrees.filter(
        (worktree) => !worktree.state.safeToRemoveManually,
    );

    if (blockingWorktrees.length === 0) {
        return [];
    }

    return [
        'detached worktrees with unresolved local state block automatic branch deletion.',
        ...blockingWorktrees.map(
            (worktree) =>
                `detached worktree ${worktree.path} requires manual review.`,
        ),
    ];
}

function readBranchTipReasonDetails(
    baseShort: string,
    state: BranchState,
): string[] {
    if (state.branchTipOnBase) {
        return [`the branch tip is reachable from ${baseShort}.`];
    }

    if (!state.hasCommonAncestor) {
        return [
            `the branch does not share a common ancestor with ${baseShort}.`,
        ];
    }

    return [
        `${state.uniqueCommitCount} commit(s) are still not reachable from ${baseShort}.`,
    ];
}

function buildBranchReflogReasonDetails(
    baseShort: string,
    state: BranchState,
): string[] {
    if (!state.branchReflogAvailable) {
        return [
            'the branch reflog could not be read, so reset-away local-only commits could not be ruled out automatically.',
        ];
    }

    if (state.branchReflogUniqueCommitCount > 0) {
        return [
            `the branch reflog still references ${state.branchReflogUniqueCommitCount} commit(s) that are not reachable from ${baseShort}.`,
        ];
    }

    return [
        `the branch reflog does not reference any commits that are still outside ${baseShort}.`,
    ];
}

function buildRemoteReasonDetails(
    branch: string,
    baseShort: string,
    remoteBranch: null | RemoteBranchAssessment,
    status: RemoteBranchStatus,
): string[] {
    return [readRemoteReasonDetail(branch, baseShort, remoteBranch, status)];
}

function readRemoteReasonDetail(
    branch: string,
    baseShort: string,
    remoteBranch: null | RemoteBranchAssessment,
    status: RemoteBranchStatus,
): string {
    const remoteName = remoteBranch?.shortName ?? 'origin branch';

    if (
        (status === 'safe' || status === 'absent') &&
        remoteBranch !== null &&
        remoteBranch.branch !== branch
    ) {
        return status === 'absent'
            ? `the tracked origin branch ${remoteName} no longer exists on the live remote, but it does not match the local branch name ${branch}, so automatic cleanup requires manual review.`
            : `the live origin branch ${remoteName} is on ${baseShort}, but it does not match the local branch name ${branch}, so automatic remote deletion requires manual review.`;
    }

    if (status === 'absent') {
        return remoteBranch === null
            ? 'no matching origin branch was configured or tracked for this local branch.'
            : `the tracked origin branch ${remoteName} no longer exists on the live remote.`;
    }

    const detailsByStatus: Record<
        Exclude<RemoteBranchStatus, 'absent'>,
        string
    > = {
        checked_out_in_origin_worktree: `the live origin branch ${remoteName} is currently checked out in the local origin repo, so automatic remote deletion requires manual review.`,
        history_not_on_base: `the live origin branch ${remoteName} may have older remote history that is not reachable from ${baseShort}, so automatic deletion fails closed.`,
        history_unverified: `the live origin branch ${remoteName} is on ${baseShort}, but its prior remote history could not be proved safe for deletion.`,
        identity_unverified:
            'git-cleanup could not prove which live origin branch belongs to this local branch, so any remote cleanup requires manual review.',
        live_probe_unverified: `the live origin branch ${remoteName} could not be probed successfully, so origin preservation is unverified.`,
        live_tip_not_on_base: `the live origin branch ${remoteName} still points to commits that are not reachable from ${baseShort}.`,
        live_tip_unverified: `the live origin branch ${remoteName} could not be verified against the local remote-tracking ref. Fetch origin before manual remote cleanup.`,
        non_origin_upstream: `the branch tracks ${remoteName}, but only origin’s default branch is treated as canonical history.`,
        protected_base: `the tracked origin branch ${remoteName} is the canonical default branch and is protected from deletion.`,
        safe: `the live origin branch ${remoteName} matches the local tracking ref and is already reachable from ${baseShort}.`,
        tracking_ref_not_on_base: `the live origin branch ${remoteName} is gone, but the remaining local origin-tracking ref is still not reachable from ${baseShort}.`,
    };

    return detailsByStatus[status];
}

function buildLinkedWorktreeReasonDetails(
    linkedWorktrees: readonly WorktreeInfo[],
    state: BranchState,
): string[] {
    if (linkedWorktrees.length === 0) {
        return ['there are no linked worktrees.'];
    }

    const details =
        linkedWorktrees.length > 0 &&
        !state.hasPrimaryWorktree &&
        !state.hasDirtyWorktree &&
        !state.hasMissingWorktree &&
        !state.hasPrunableWorktree
            ? [
                  'linked worktrees are present; even clean linked worktrees require manual review and are never removed automatically.',
              ]
            : [];

    for (const worktree of linkedWorktrees) {
        details.push(...buildSingleLinkedWorktreeReasonDetails(worktree));
    }

    return details;
}

function buildSingleLinkedWorktreeReasonDetails(
    worktree: WorktreeInfo,
): string[] {
    return [
        worktree.isPrimary
            ? `the branch is checked out in the primary worktree at ${worktree.path}.`
            : null,
        worktree.state === 'dirty'
            ? `the linked worktree at ${worktree.path} has local state that must be reviewed manually (${worktree.statusLines.length} signal(s)).`
            : null,
        worktree.state === 'missing'
            ? `the linked worktree at ${worktree.path} is missing from disk.`
            : null,
        worktree.state === 'prunable'
            ? `the linked worktree at ${worktree.path} is marked prunable.`
            : null,
    ].filter((detail): detail is string => detail !== null);
}

function sortByName<NamedValue extends { name: string }>(
    values: readonly NamedValue[],
): NamedValue[] {
    return [...values].sort((left, right) =>
        left.name.localeCompare(right.name),
    );
}

function buildDetachedWorktreeReports(
    repoRoot: string,
    base: BaseRef,
    worktrees: readonly WorktreeInfo[],
    hiddenRefAnalysis: HiddenRefAnalysis,
    repositoryReflogAnalysis: ReflogAnalysis,
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
): DetachedWorktreeReport[] {
    const reports: DetachedWorktreeReport[] = [];

    for (const worktree of worktrees) {
        if (
            worktree.branchName === null &&
            !worktree.bare &&
            worktree.headSha !== ''
        ) {
            reports.push(
                buildDetachedWorktreeReport(
                    repoRoot,
                    base,
                    worktree,
                    worktrees,
                    hiddenRefAnalysis,
                    repositoryReflogAnalysis,
                    unreachableCommitAnalysis,
                ),
            );
        }
    }

    reports.sort((left, right) => left.path.localeCompare(right.path));
    return reports;
}

function buildDetachedWorktreeReport(
    repoRoot: string,
    base: BaseRef,
    worktree: WorktreeInfo,
    worktrees: readonly WorktreeInfo[],
    hiddenRefAnalysis: HiddenRefAnalysis,
    repositoryReflogAnalysis: ReflogAnalysis,
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
): DetachedWorktreeReport {
    const headReflogAnalysis = readDetachedHeadReflogAnalysis(
        worktree.path,
        base.liveSha,
    );
    const headOnBase = gitSucceeded(repoRoot, [
        'merge-base',
        '--is-ancestor',
        worktree.headSha,
        base.liveSha,
    ]);
    const repositoryDirtyWorktrees = readRepositoryDirtyWorktrees(worktrees);
    const safeToRemoveManually = isDetachedWorktreeSafeToRemoveManually(
        worktree,
        headOnBase,
        headReflogAnalysis,
        hiddenRefAnalysis,
        repositoryReflogAnalysis,
        unreachableCommitAnalysis,
        repositoryDirtyWorktrees,
    );
    const state: DetachedWorktreeState = {
        headOnBase,
        headReflogAvailable: headReflogAnalysis.available,
        headReflogUniqueCommitCount: headReflogAnalysis.uniqueCommitCount,
        repositoryHiddenRefCount: hiddenRefAnalysis.refs.length,
        repositoryHiddenRefs: hiddenRefAnalysis.refs,
        repositoryHiddenRefsAvailable: hiddenRefAnalysis.available,
        repositoryReflogAvailable: repositoryReflogAnalysis.available,
        repositoryReflogUniqueCommitCount:
            repositoryReflogAnalysis.uniqueCommitCount,
        repositoryUnreachableCommitCount: unreachableCommitAnalysis.commitCount,
        repositoryUnreachableCommitsAvailable:
            unreachableCommitAnalysis.available,
        repositoryWorktreeDirtyCount: repositoryDirtyWorktrees.length,
        repositoryWorktreeDirtyPaths: repositoryDirtyWorktrees.map(
            (dirtyWorktree) => dirtyWorktree.path,
        ),
        safeToRemoveManually,
        status: worktree.state,
        statusLineCount: worktree.statusLines.length,
    };

    return {
        classification: 'needs_review',
        headCommit: readSingleCommit(repoRoot, worktree.headSha),
        opinion: decideDetachedWorktreeOpinion(base.shortName, state),
        path: worktree.path,
        reasonCodes: collectDetachedReasonCodes(worktree, state),
        reasonDetails: buildDetachedReasonDetails(
            base.shortName,
            worktree,
            state,
        ),
        state,
        statusLines: worktree.statusLines,
    };
}

function isDetachedWorktreeSafeToRemoveManually(
    worktree: WorktreeInfo,
    headOnBase: boolean,
    headReflogAnalysis: ReflogAnalysis,
    hiddenRefAnalysis: HiddenRefAnalysis,
    repositoryReflogAnalysis: ReflogAnalysis,
    unreachableCommitAnalysis: RepositoryUnreachableCommitAnalysis,
    repositoryDirtyWorktrees: readonly WorktreeInfo[],
): boolean {
    return [
        worktree.state === 'clean',
        repositoryDirtyWorktrees.length === 0,
        headOnBase,
        headReflogAnalysis.available,
        headReflogAnalysis.uniqueCommitCount === 0,
        hiddenRefAnalysis.available,
        hiddenRefAnalysis.refs.length === 0,
        repositoryReflogAnalysis.available,
        repositoryReflogAnalysis.uniqueCommitCount === 0,
        unreachableCommitAnalysis.available,
        unreachableCommitAnalysis.commitCount === 0,
    ].every(Boolean);
}

function readDetachedHeadReflogAnalysis(
    repoPath: string,
    baseRef: string,
): ReflogAnalysis {
    const absoluteGitDir = tryGit(repoPath, [
        'rev-parse',
        '--absolute-git-dir',
    ]);

    if (!absoluteGitDir.ok || absoluteGitDir.stdout === '') {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    const parsedReflog = readReflogShas(
        join(absoluteGitDir.stdout, 'logs', 'HEAD'),
    );

    if (parsedReflog === null || parsedReflog.shas.length === 0) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    const uniqueCommitCount = countReflogOnlyCommits(
        repoPath,
        baseRef,
        parsedReflog.shas,
    );

    if (uniqueCommitCount === null) {
        return {
            available: false,
            fingerprint: null,
            uniqueCommitCount: 0,
        };
    }

    return {
        available: true,
        fingerprint: parsedReflog.fingerprint,
        uniqueCommitCount,
    };
}

function decideDetachedWorktreeOpinion(
    baseShort: string,
    state: DetachedWorktreeState,
): Opinion {
    return state.safeToRemoveManually
        ? {
              code: 'probably_delete',
              label: 'probably delete the worktree',
              reason: `the detached commit, detached HEAD reflog, repository-wide reflog graph, and repository object graph are already preserved on ${baseShort}, and the worktree is clean.`,
          }
        : {
              code: 'needs_human_review',
              label: 'needs human review',
              reason: 'detached worktrees are never deleted automatically by this skill.',
          };
}

function collectDetachedReasonCodes(
    worktree: WorktreeInfo,
    state: DetachedWorktreeState,
): DetachedWorktreeReasonCode[] {
    return [
        state.headOnBase
            ? 'detached_head_on_base'
            : 'detached_head_not_on_base',
        ...readDetachedRepositoryReasonCodes(state),
        ...readDetachedReflogReasonCodes(state),
        readDetachedWorktreeStateReasonCode(worktree.state),
    ].filter(
        (reasonCode): reasonCode is DetachedWorktreeReasonCode =>
            reasonCode !== null,
    );
}

function readDetachedRepositoryReasonCodes(
    state: DetachedWorktreeState,
): DetachedWorktreeReasonCode[] {
    return [
        ...(!state.repositoryHiddenRefsAvailable
            ? (['repository_hidden_refs_unavailable'] as const)
            : []),
        ...(state.repositoryHiddenRefCount > 0
            ? (['repository_hidden_refs_present'] as const)
            : []),
        ...(!state.repositoryReflogAvailable
            ? (['repository_reflog_unavailable'] as const)
            : []),
        ...(state.repositoryReflogUniqueCommitCount > 0
            ? (['repository_reflog_has_unique_commits'] as const)
            : []),
        ...(!state.repositoryUnreachableCommitsAvailable
            ? (['repository_unreachable_commits_unavailable'] as const)
            : []),
        ...(state.repositoryUnreachableCommitCount > 0
            ? (['repository_unreachable_commits_present'] as const)
            : []),
        ...(state.repositoryWorktreeDirtyCount > 0
            ? (['repository_worktree_dirty'] as const)
            : []),
    ];
}

function readDetachedReflogReasonCodes(
    state: DetachedWorktreeState,
): DetachedWorktreeReasonCode[] {
    return [
        ...(!state.headReflogAvailable
            ? (['detached_head_reflog_unavailable'] as const)
            : []),
        ...(state.headReflogUniqueCommitCount > 0
            ? (['detached_head_reflog_has_unique_commits'] as const)
            : []),
    ];
}

function readDetachedWorktreeStateReasonCode(
    worktreeState: WorktreeState,
): DetachedWorktreeReasonCode | null {
    const codesByState: Partial<
        Record<WorktreeState, DetachedWorktreeReasonCode>
    > = {
        clean: 'detached_worktree_clean',
        dirty: 'detached_worktree_dirty',
        missing: 'detached_worktree_missing',
        prunable: 'detached_worktree_prunable',
    };

    return codesByState[worktreeState] ?? null;
}

function buildDetachedReasonDetails(
    baseShort: string,
    worktree: WorktreeInfo,
    state: DetachedWorktreeState,
): string[] {
    return [
        state.headOnBase
            ? `the detached HEAD commit is reachable from ${baseShort}.`
            : `the detached HEAD commit is not known to be reachable from ${baseShort}.`,
        ...readDetachedRepositoryReasonDetails(state),
        ...readDetachedReflogReasonDetails(baseShort, state),
        readDetachedWorktreeStateReasonDetail(worktree),
    ].filter((detail): detail is string => detail !== null);
}

function readDetachedRepositoryReasonDetails(
    state: DetachedWorktreeState,
): string[] {
    return [
        ...(!state.repositoryHiddenRefsAvailable
            ? [
                  'the repository-wide ref scan could not complete, so reachable refs outside the canonical base could not be ruled out automatically.',
              ]
            : []),
        ...(state.repositoryHiddenRefCount > 0
            ? [
                  `the repository still has ${state.repositoryHiddenRefCount} reachable ref(s) outside the canonical base.`,
              ]
            : []),
        ...(!state.repositoryReflogAvailable
            ? [
                  'the repository-wide reflog scan could not complete, so retained reflog-only history outside the canonical base could not be ruled out automatically.',
              ]
            : []),
        ...(state.repositoryReflogUniqueCommitCount > 0
            ? [
                  `the repository-wide reflog graph still references ${state.repositoryReflogUniqueCommitCount} commit(s) that are not reachable from the canonical base.`,
              ]
            : []),
        ...(!state.repositoryUnreachableCommitsAvailable
            ? [
                  'the repository-wide unreachable-commit scan could not complete, so expired reflog-only local history could not be ruled out automatically.',
              ]
            : []),
        ...(state.repositoryUnreachableCommitCount > 0
            ? [
                  `the repository still contains ${state.repositoryUnreachableCommitCount} unreachable object(s), so detached worktree cleanup fails closed until they are reviewed or pruned.`,
              ]
            : []),
        ...(state.repositoryWorktreeDirtyCount > 0
            ? [
                  `the repository has ${state.repositoryWorktreeDirtyCount} dirty, missing, or prunable worktree(s), so detached worktree cleanup fails closed.`,
                  ...state.repositoryWorktreeDirtyPaths.map(
                      (worktreePath) =>
                          `worktree ${worktreePath} has local state that requires manual review.`,
                  ),
              ]
            : []),
    ];
}

function readDetachedReflogReasonDetails(
    baseShort: string,
    state: DetachedWorktreeState,
): string[] {
    return [
        ...(!state.headReflogAvailable
            ? [
                  'the detached HEAD reflog could not be read, so reset-away local-only commits could not be ruled out automatically.',
              ]
            : []),
        ...(state.headReflogUniqueCommitCount > 0
            ? [
                  `the detached HEAD reflog still references ${state.headReflogUniqueCommitCount} commit(s) that are not reachable from ${baseShort}.`,
              ]
            : []),
    ];
}

function readDetachedWorktreeStateReasonDetail(
    worktree: WorktreeInfo,
): null | string {
    const detailsByState: Partial<Record<WorktreeState, string>> = {
        clean: 'the detached worktree is clean.',
        dirty: `the detached worktree at ${worktree.path} has local state that must be reviewed manually (${worktree.statusLines.length} signal(s)).`,
        missing: `the detached worktree at ${worktree.path} is missing from disk.`,
        prunable: `the detached worktree at ${worktree.path} is marked prunable.`,
    };

    return detailsByState[worktree.state] ?? null;
}

function buildSummary(
    branches: BranchBuckets,
    detachedWorktrees: readonly DetachedWorktreeReport[],
): Summary {
    return {
        detachedWorktrees: detachedWorktrees.length,
        needsReviewBranches: branches.needsReview.length,
        safeDeleteBranches: branches.safeDelete.length,
        skippedBranches: branches.skipped.length,
    };
}

function applySafeDeletes(
    repoRoot: string,
    auditedBase: BaseRef,
    safeDeleteBranches: readonly BranchReport[],
): ApplyResult[] {
    const results: ApplyResult[] = [];

    for (const branch of safeDeleteBranches) {
        results.push(applySafeDeleteBranch(repoRoot, auditedBase, branch));
    }

    return results;
}

function applySafeDeleteBranch(
    repoRoot: string,
    auditedBase: BaseRef,
    auditedBranch: BranchReport,
): ApplyResult {
    const context = createApplyContext();

    try {
        return runApplySafeDeleteBranch(
            repoRoot,
            auditedBase,
            auditedBranch,
            context,
        );
    } catch (error) {
        return buildApplyExceptionResult(
            repoRoot,
            auditedBranch.name,
            context,
            readUnknownErrorMessage(error),
        );
    }
}

function createApplyContext(): ApplyContext {
    return {
        applyBase: null,
        applyBranchReport: null,
        localBranch: null,
        remoteBranch: null,
        worktreeArchiveSummary: emptyWorktreeArchiveSummary(),
    };
}

function runApplySafeDeleteBranch(
    repoRoot: string,
    auditedBase: BaseRef,
    auditedBranch: BranchReport,
    context: ApplyContext,
): ApplyResult {
    const refreshedBranchAudit = readRevalidatedBranchReport(
        repoRoot,
        auditedBase,
        auditedBranch.name,
    );
    const refreshedReport = refreshedBranchAudit.report;

    if (refreshedReport.classification !== 'safe_delete') {
        return buildApplyBlockedResult(
            auditedBranch.name,
            `branch ${auditedBranch.name} is no longer classified safe_delete.`,
            'the branch safety proof changed before apply.',
        );
    }

    if (!branchProofFingerprintsMatch(auditedBranch, refreshedReport)) {
        return buildApplyBlockedResult(
            auditedBranch.name,
            `branch ${auditedBranch.name} safety proof changed before apply.`,
            'the branch safety proof changed before apply.',
        );
    }

    Object.assign(context, {
        worktreeArchiveSummary: archiveSafeLinkedWorktrees(
            repoRoot,
            refreshedReport.linkedWorktrees,
        ),
    });

    return runApplyAfterWorktreeArchive(
        repoRoot,
        auditedBase,
        auditedBranch,
        refreshedBranchAudit,
        context,
    );
}

function runApplyAfterWorktreeArchive(
    repoRoot: string,
    auditedBase: BaseRef,
    auditedBranch: BranchReport,
    refreshedBranchAudit: BranchAuditSnapshot,
    context: ApplyContext,
): ApplyResult {
    const postArchiveBranchAudit = readRevalidatedBranchReport(
        repoRoot,
        refreshedBranchAudit.base,
        auditedBranch.name,
    );
    const postArchiveReport = postArchiveBranchAudit.report;
    const blockedResult = readPostArchiveBlockedApplyResult(
        auditedBranch,
        postArchiveReport,
    );

    if (blockedResult !== null) {
        return blockedResult;
    }

    const initialBranches = deleteLocalAndRemoteBranches(
        repoRoot,
        postArchiveBranchAudit,
        context,
    );
    const finalBranches = restoreBranchesAfterApplyArchiveIssues(
        repoRoot,
        postArchiveBranchAudit,
        initialBranches,
        context,
    );

    return buildApplyResult(
        repoRoot,
        auditedBase,
        auditedBranch.name,
        postArchiveReport,
        context.worktreeArchiveSummary,
        finalBranches.localBranch,
        finalBranches.remoteBranch,
    );
}

function readPostArchiveBlockedApplyResult(
    auditedBranch: BranchReport,
    postArchiveReport: BranchReport,
): ApplyResult | null {
    if (
        postArchiveReport.classification !== 'safe_delete' ||
        !branchProofFingerprintsMatch(auditedBranch, postArchiveReport)
    ) {
        return buildApplyBlockedResult(
            auditedBranch.name,
            `branch ${auditedBranch.name} safety proof changed after worktree archival.`,
            'the branch safety proof changed before local branch archival.',
        );
    }

    return null;
}

function deleteLocalAndRemoteBranches(
    repoRoot: string,
    postArchiveBranchAudit: BranchAuditSnapshot,
    context: ApplyContext,
): ApplyBranchResults {
    const localBranch = deleteLocalBranchAfterWorktreeArchive(
        repoRoot,
        postArchiveBranchAudit,
        context,
    );
    const remoteBranch = deleteRemoteBranchAfterLocalArchive(
        repoRoot,
        postArchiveBranchAudit,
        localBranch,
        context,
    );

    return { localBranch, remoteBranch };
}

function deleteLocalBranchAfterWorktreeArchive(
    repoRoot: string,
    postArchiveBranchAudit: BranchAuditSnapshot,
    context: ApplyContext,
): LocalDeleteResult {
    Object.assign(context, {
        applyBase: postArchiveBranchAudit.base,
        applyBranchReport: postArchiveBranchAudit.report,
        localBranch: deleteLocalBranch(
            repoRoot,
            postArchiveBranchAudit.base,
            postArchiveBranchAudit.report,
            context.worktreeArchiveSummary.errors.length === 0,
        ),
    });

    return requireLocalDeleteResult(context.localBranch);
}

function deleteRemoteBranchAfterLocalArchive(
    repoRoot: string,
    postArchiveBranchAudit: BranchAuditSnapshot,
    localBranch: LocalDeleteResult,
    context: ApplyContext,
): RemoteDeleteResult {
    Object.assign(context, {
        remoteBranch: deleteRemoteBranch(
            repoRoot,
            postArchiveBranchAudit.base,
            postArchiveBranchAudit.report,
            localBranch,
        ),
    });

    return requireRemoteDeleteResult(context.remoteBranch);
}

function requireLocalDeleteResult(
    localBranch: LocalDeleteResult | null,
): LocalDeleteResult {
    if (localBranch === null) {
        throw new Error('local branch deletion did not return a result.');
    }

    return localBranch;
}

function requireRemoteDeleteResult(
    remoteBranch: null | RemoteDeleteResult,
): RemoteDeleteResult {
    if (remoteBranch === null) {
        throw new Error('remote branch deletion did not return a result.');
    }

    return remoteBranch;
}

function restoreBranchesAfterApplyArchiveIssues(
    repoRoot: string,
    postArchiveBranchAudit: BranchAuditSnapshot,
    initialBranches: ApplyBranchResults,
    context: ApplyContext,
): ApplyBranchResults {
    const validatedRemoteBranch = restoreRemoteBranchAfterLocalArchiveIssue(
        repoRoot,
        postArchiveBranchAudit.report,
        initialBranches.localBranch,
        initialBranches.remoteBranch,
    );
    setApplyBranches(context, {
        localBranch: initialBranches.localBranch,
        remoteBranch: validatedRemoteBranch,
    });

    const restoredLocalBranch = restoreLocalBranchAfterRemoteFailure(
        repoRoot,
        postArchiveBranchAudit.base,
        postArchiveBranchAudit.report,
        initialBranches.localBranch,
        validatedRemoteBranch,
    );
    setApplyBranches(context, {
        localBranch: restoredLocalBranch,
        remoteBranch: validatedRemoteBranch,
    });

    const localProofBranches = restoreArchivesAfterRemoteArchiveLocalProofIssue(
        repoRoot,
        postArchiveBranchAudit.base,
        postArchiveBranchAudit.report,
        restoredLocalBranch,
        validatedRemoteBranch,
    );
    setApplyBranches(context, localProofBranches);

    const remoteProofBranches = restoreArchivesAfterFinalRemoteProofIssue(
        repoRoot,
        postArchiveBranchAudit.base,
        postArchiveBranchAudit.report,
        localProofBranches.localBranch,
        localProofBranches.remoteBranch,
    );
    setApplyBranches(context, remoteProofBranches);

    return setApplyBranches(
        context,
        restoreArchivesAfterFinalApplyIssue(
            repoRoot,
            postArchiveBranchAudit.base,
            postArchiveBranchAudit.report,
            remoteProofBranches.localBranch,
            remoteProofBranches.remoteBranch,
        ),
    );
}

function setApplyBranches(
    context: ApplyContext,
    branches: ApplyBranchResults,
): ApplyBranchResults {
    Object.assign(context, {
        localBranch: branches.localBranch,
        remoteBranch: branches.remoteBranch,
    });

    return branches;
}

function branchProofFingerprintsMatch(
    expectedBranch: BranchReport,
    refreshedBranch: BranchReport,
): boolean {
    return (
        expectedBranch.state.safetyProofFingerprint !== null &&
        refreshedBranch.state.safetyProofFingerprint !== null &&
        expectedBranch.state.safetyProofFingerprint ===
            refreshedBranch.state.safetyProofFingerprint
    );
}

function buildApplyResult(
    repoRoot: string,
    base: BaseRef,
    branchName: string,
    branch: BranchReport,
    worktreeArchiveSummary: WorktreeArchiveSummary,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): ApplyResult {
    const finalApplyIssues = readFinalApplyValidationIssues(
        repoRoot,
        base,
        branchName,
        branch,
        localBranch,
        remoteBranch,
    );
    const finalBranches = restoreArchivesAfterApplyIssues(
        repoRoot,
        branch,
        localBranch,
        remoteBranch,
        finalApplyIssues,
    );

    return buildApplyResultFromFinalState(
        repoRoot,
        branchName,
        branch,
        worktreeArchiveSummary,
        finalBranches.localBranch,
        finalBranches.remoteBranch,
        finalApplyIssues,
    );
}

function buildApplyResultFromFinalState(
    repoRoot: string,
    branchName: string,
    branch: BranchReport,
    worktreeArchiveSummary: WorktreeArchiveSummary,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
    finalApplyIssues: readonly string[],
): ApplyResult {
    const localBackupRef = readReportedLocalBackupRef(repoRoot, localBranch);
    const remoteBackupRef = readReportedRemoteBackupRef(remoteBranch);
    const localBranchStillAbsent = !branchRefExists(repoRoot, branchName);
    const remoteBranchStillAbsent = remoteDeleteTargetStillAbsent(
        repoRoot,
        branch,
        remoteBranch,
    );
    const finalProofValid = finalApplyIssues.length === 0;
    const localBranchDeleted =
        branchDeleteSucceededCleanly(
            localBranch.deleted,
            localBranch.archivedSha,
            localBranch.backupRef,
            localBackupRef,
            localBranchStillAbsent,
            localBranch.errors,
            localBranch.skippedReason,
        ) && finalProofValid;
    const remoteBranchDeleted =
        remoteBranchDeleteSucceededCleanly(
            remoteBranch,
            remoteBackupRef,
            remoteBranchStillAbsent,
        ) &&
        finalProofValid &&
        localBranchStillAbsent;

    return {
        branch: branchName,
        errors: [
            ...worktreeArchiveSummary.errors,
            ...localBranch.errors,
            ...remoteBranch.errors,
            ...finalApplyIssues,
            ...readBackupValidationErrors(
                'local',
                localBranch.deleted,
                localBranch.backupRef,
                localBackupRef,
            ),
            ...readDeletedBranchRefValidationErrors(
                'local',
                localBranch.deleted,
                localBranchStillAbsent,
            ),
            ...readBackupValidationErrors(
                'remote',
                remoteBranch.deleted,
                remoteBranch.backupRef,
                remoteBackupRef,
            ),
            ...readDeletedBranchRefValidationErrors(
                'remote',
                remoteBranch.deleted,
                remoteBranchStillAbsent,
            ),
        ],
        localBackupRef,
        localBranchDeleted,
        localBranchSkippedReason: localBranch.skippedReason,
        remoteBackupRef,
        remoteBranchDeleted,
        remoteBranchSkippedReason: remoteBranch.skippedReason,
        removedWorktrees: worktreeArchiveSummary.removedWorktrees,
        worktreeBackupPaths: worktreeArchiveSummary.worktreeBackupPaths,
    };
}

function readFinalApplyValidationIssues(
    repoRoot: string,
    base: BaseRef,
    branchName: string,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): string[] {
    return [
        readFinalApplyProofIssue(repoRoot, base, branchName),
        readFinalLocalArchiveWorktreeIssue(repoRoot, branchName, localBranch),
        readFinalReportedRemoteArchiveIssue(
            repoRoot,
            base,
            branch,
            remoteBranch,
        ),
    ].filter((issue): issue is string => issue !== null);
}

function readFinalReportedRemoteArchiveIssue(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    remoteBranch: RemoteDeleteResult,
): null | string {
    if (remoteBranch.safeWithoutDelete === true) {
        const issue = readSafeWithoutDeleteRemoteIssue(
            repoRoot,
            base,
            branch,
            remoteBranch,
        );

        return issue === null
            ? null
            : `final absent remote proof revalidation failed: ${issue}`;
    }

    if (!remoteBranch.deleted) {
        return null;
    }

    return remoteDeleteResultIsHostedDelete(remoteBranch)
        ? readFinalHostedRemoteDeletionIssue(repoRoot, base, branch)
        : readFinalArchivedRemoteBranchIssue(
              repoRoot,
              base,
              branch,
              remoteBranch,
          );
}

function readFinalHostedRemoteDeletionIssue(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
): null | string {
    if (branch.remoteBranch === null) {
        return 'final hosted remote deletion revalidation failed: the original remote branch could not be identified.';
    }

    const issue = readHostedRemoteDeleteFinalIssue(
        repoRoot,
        base,
        branch.remoteBranch,
    );

    return issue === null
        ? null
        : `final hosted remote deletion revalidation failed: ${issue}`;
}

function readFinalArchivedRemoteBranchIssue(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    remoteBranch: RemoteDeleteResult,
): null | string {
    const recordedArchive = readRecordedRemoteArchive(remoteBranch);

    if (recordedArchive === null || branch.remoteBranch === null) {
        return 'final remote archive proof revalidation failed: the remote branch archive was not fully recorded.';
    }

    const archiveBranchName = recordedArchive.backupRef.replace(
        /^refs\/heads\//u,
        '',
    );
    const issue = readFinalRemoteArchiveIssue(
        repoRoot,
        recordedArchive.backupRepoPath,
        base,
        branch.remoteBranch,
        archiveBranchName,
    );

    return issue === null
        ? null
        : `final remote archive proof revalidation failed: ${issue}`;
}

function readFinalLocalArchiveWorktreeIssue(
    repoRoot: string,
    branchName: string,
    localBranch: LocalDeleteResult,
): null | string {
    const archivedBranchName = localBranch.backupRef?.replace(
        /^refs\/heads\//u,
        '',
    );

    if (!localBranch.deleted || archivedBranchName === undefined) {
        return null;
    }

    const worktreeIssue = readArchiveBranchWorktreeIssue(
        repoRoot,
        branchName,
        archivedBranchName,
    );

    return worktreeIssue === null
        ? null
        : `final apply proof revalidation failed: ${worktreeIssue}`;
}

function readFinalApplyProofIssue(
    repoRoot: string,
    base: BaseRef,
    branchName: string,
): null | string {
    try {
        const finalBaseIssue = readLiveBaseValidationIssue(repoRoot, base);

        if (finalBaseIssue !== null) {
            return `final apply proof revalidation failed: ${finalBaseIssue}`;
        }

        const repositoryIssue = readPostArchiveRepositorySafetyIssue(
            repoRoot,
            base,
        );

        return repositoryIssue === null
            ? null
            : `final apply proof revalidation failed for ${branchName}: ${repositoryIssue}`;
    } catch (error) {
        return `final apply proof revalidation failed: ${readUnknownErrorMessage(error)}`;
    }
}

function remoteDeleteTargetStillAbsent(
    repoRoot: string,
    branch: BranchReport,
    remoteBranch: RemoteDeleteResult,
): boolean {
    const remoteRepoPath = remoteBranch.backupRepoPath;
    const remoteBranchName = branch.remoteBranch?.branch;

    if (
        remoteDeleteResultIsHostedDelete(remoteBranch) &&
        remoteBranchName !== undefined
    ) {
        return (
            readLiveOriginBranchProbe(repoRoot, remoteBranchName).kind ===
            'absent'
        );
    }

    return (
        remoteRepoPath !== undefined &&
        remoteRepoPath !== null &&
        remoteBranchName !== undefined &&
        !branchRefExists(remoteRepoPath, remoteBranchName)
    );
}

function remoteBranchDeleteSucceededCleanly(
    remoteBranch: RemoteDeleteResult,
    reportedBackupRef: null | string,
    branchStillAbsent: boolean,
): boolean {
    if (remoteDeleteResultIsHostedDelete(remoteBranch)) {
        return (
            branchStillAbsent &&
            remoteBranch.errors.length === 0 &&
            remoteBranch.skippedReason === null
        );
    }

    return branchDeleteSucceededCleanly(
        remoteBranch.deleted,
        remoteBranch.archivedSha ?? null,
        remoteBranch.backupRef,
        reportedBackupRef,
        branchStillAbsent,
        remoteBranch.errors,
        remoteBranch.skippedReason,
    );
}

function remoteDeleteResultIsHostedDelete(
    remoteBranch: RemoteDeleteResult,
): boolean {
    return (
        remoteBranch.deleted &&
        remoteBranch.archivedSha !== undefined &&
        remoteBranch.archivedSha !== null &&
        remoteBranch.backupRef === null &&
        (remoteBranch.backupRepoPath === undefined ||
            remoteBranch.backupRepoPath === null)
    );
}

function readBackupValidationErrors(
    label: 'local' | 'remote',
    branchDeleted: boolean,
    expectedBackupRef: null | string,
    reportedBackupRef: null | string,
): string[] {
    return branchDeleted &&
        expectedBackupRef !== null &&
        reportedBackupRef === null
        ? [
              `${label} branch archive ref ${expectedBackupRef} could not be revalidated before reporting.`,
          ]
        : [];
}

function readDeletedBranchRefValidationErrors(
    label: 'local' | 'remote',
    branchDeleted: boolean,
    branchStillAbsent: boolean,
): string[] {
    return branchDeleted && !branchStillAbsent
        ? [
              `${label} branch ref was recreated before deletion could be reported as successful.`,
          ]
        : [];
}

function branchDeleteSucceededCleanly(
    branchDeleted: boolean,
    archivedSha: null | string,
    expectedBackupRef: null | string,
    reportedBackupRef: null | string,
    branchStillAbsent: boolean,
    errors: readonly string[],
    skippedReason: null | string,
): boolean {
    return (
        branchDeleted &&
        archivedSha !== null &&
        expectedBackupRef !== null &&
        reportedBackupRef !== null &&
        branchStillAbsent &&
        errors.length === 0 &&
        skippedReason === null
    );
}

function restoreRemoteBranchAfterLocalArchiveIssue(
    repoRoot: string,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): RemoteDeleteResult {
    if (!remoteBranch.deleted) {
        return remoteBranch;
    }

    const localArchiveIssue = readLocalArchiveRemoteDeleteIssue(
        repoRoot,
        branch.name,
        localBranch,
    );

    if (localArchiveIssue !== null) {
        return restoreRemoteBranchAfterIssue(
            branch,
            remoteBranch,
            localArchiveIssue,
        );
    }

    const remoteArchiveIssue = readRemoteArchiveResultIssue(remoteBranch);

    return remoteArchiveIssue === null
        ? remoteBranch
        : restoreRemoteBranchAfterIssue(
              branch,
              remoteBranch,
              remoteArchiveIssue,
          );
}

function restoreRemoteBranchAfterIssue(
    branch: BranchReport,
    remoteBranch: RemoteDeleteResult,
    issue: string,
): RemoteDeleteResult {
    const originalBranchName = branch.remoteBranch?.branch;

    if (originalBranchName === undefined) {
        return {
            ...remoteBranch,
            deleted: false,
            errors: [
                ...remoteBranch.errors,
                `${issue}, but git-cleanup could not identify the original remote branch name.`,
            ],
            skippedReason: `${issue}, and git-cleanup could not restore the original remote branch name.`,
        };
    }

    const restoredRemoteBranch = restoreRemoteBranchFromResult(
        remoteBranch,
        originalBranchName,
        issue,
        branch.remoteBranch?.shortName ?? originalBranchName,
    );

    return {
        ...restoredRemoteBranch,
        errors: [...remoteBranch.errors, ...restoredRemoteBranch.errors],
    };
}

function restoreRemoteBranchFromResult(
    remoteBranch: RemoteDeleteResult,
    originalBranchName: string,
    issue: string,
    restoreTargetLabel: string,
): RemoteDeleteResult {
    if (
        remoteBranch.backupRepoPath === undefined ||
        remoteBranch.backupRepoPath === null ||
        remoteBranch.backupRef === null ||
        remoteBranch.archivedSha === undefined ||
        remoteBranch.archivedSha === null ||
        remoteBranch.backupReflogPrefix === undefined ||
        remoteBranch.backupReflogPrefix === null
    ) {
        return {
            ...remoteBranch,
            deleted: false,
            errors: [
                `${issue}, but git-cleanup could not locate the remote archive ref.`,
            ],
            skippedReason: `${issue}, and git-cleanup could not restore ${restoreTargetLabel}.`,
        };
    }

    return restoreRemoteArchiveAfterIssue(
        remoteBranch.backupRepoPath,
        originalBranchName,
        remoteBranch.backupRef.replace(/^refs\/heads\//u, ''),
        remoteBranch.backupRef,
        remoteBranch.archivedSha,
        remoteBranch.backupReflogPrefix,
        issue,
        restoreTargetLabel,
    );
}

function readRemoteArchiveResultIssue(
    remoteBranch: RemoteDeleteResult,
): null | string {
    if (
        !remoteBranch.deleted ||
        remoteDeleteResultIsHostedDelete(remoteBranch)
    ) {
        return null;
    }

    const recordedArchive = readRecordedRemoteArchive(remoteBranch);

    if (recordedArchive === null) {
        return 'the remote branch archive was not fully recorded.';
    }

    const validatedRemoteBackupRef = readValidatedBranchBackupRef(
        recordedArchive.backupRepoPath,
        recordedArchive.backupRef,
        recordedArchive.archivedSha,
        recordedArchive.backupReflogPrefix,
    );

    return validatedRemoteBackupRef === null
        ? 'the remote branch archive ref could not be revalidated.'
        : null;
}

function readRecordedRemoteArchive(
    remoteBranch: RemoteDeleteResult,
): null | RecordedRemoteArchive {
    if (
        remoteBranch.backupRepoPath === undefined ||
        remoteBranch.backupRepoPath === null ||
        remoteBranch.backupRef === null ||
        remoteBranch.archivedSha === undefined ||
        remoteBranch.archivedSha === null ||
        remoteBranch.backupReflogPrefix === undefined ||
        remoteBranch.backupReflogPrefix === null
    ) {
        return null;
    }

    return {
        archivedSha: remoteBranch.archivedSha,
        backupRef: remoteBranch.backupRef,
        backupReflogPrefix: remoteBranch.backupReflogPrefix,
        backupRepoPath: remoteBranch.backupRepoPath,
    };
}

function buildApplyExceptionResult(
    repoRoot: string,
    branchName: string,
    context: ApplyContext,
    error: string,
): ApplyResult {
    if (
        context.localBranch !== null &&
        context.remoteBranch !== null &&
        context.applyBase !== null &&
        context.applyBranchReport !== null
    ) {
        return buildApplyExceptionAfterRemoteBranchResult(
            repoRoot,
            branchName,
            context.applyBase,
            context.applyBranchReport,
            context.localBranch,
            context.remoteBranch,
            context.worktreeArchiveSummary,
            error,
        );
    }

    if (context.localBranch !== null) {
        return context.localBranch.deleted
            ? buildApplyExceptionAfterLocalArchiveResult(
                  repoRoot,
                  branchName,
                  context.localBranch,
                  context.worktreeArchiveSummary,
                  error,
              )
            : buildApplyExceptionAfterLocalBranchResult(
                  repoRoot,
                  branchName,
                  context.localBranch,
                  context.worktreeArchiveSummary,
                  error,
              );
    }

    return {
        ...buildApplyBlockedResult(
            branchName,
            error,
            'the branch could not be revalidated before apply.',
        ),
        removedWorktrees: context.worktreeArchiveSummary.removedWorktrees,
        worktreeBackupPaths: context.worktreeArchiveSummary.worktreeBackupPaths,
    };
}

function buildApplyExceptionAfterRemoteBranchResult(
    repoRoot: string,
    branchName: string,
    base: BaseRef,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
    worktreeArchiveSummary: WorktreeArchiveSummary,
    error: string,
): ApplyResult {
    const issue = `apply failed after remote branch handling: ${error}`;
    const restoredRemoteBranch = remoteBranch.deleted
        ? restoreRemoteBranchAfterIssue(branch, remoteBranch, issue)
        : remoteBranch;
    const restoredLocalBranch = localBranch.deleted
        ? restoreLocalBranchAfterIssue(repoRoot, branchName, localBranch, issue)
        : localBranch;

    return buildApplyResult(
        repoRoot,
        base,
        branchName,
        branch,
        worktreeArchiveSummary,
        restoredLocalBranch,
        {
            ...restoredRemoteBranch,
            errors: [...restoredRemoteBranch.errors, issue],
        },
    );
}

function buildApplyExceptionAfterLocalBranchResult(
    repoRoot: string,
    branchName: string,
    localBranch: LocalDeleteResult,
    worktreeArchiveSummary: {
        errors: string[];
        removedWorktrees: string[];
        worktreeBackupPaths: string[];
    },
    error: string,
): ApplyResult {
    const skippedReason =
        localBranch.skippedReason ??
        'apply failed after local branch handling, so the local branch was not archived.';

    return {
        branch: branchName,
        errors: [
            ...worktreeArchiveSummary.errors,
            ...localBranch.errors,
            error,
        ],
        localBackupRef: readReportedLocalBackupRef(repoRoot, localBranch),
        localBranchDeleted: localBranch.deleted,
        localBranchSkippedReason: skippedReason,
        remoteBackupRef: null,
        remoteBranchDeleted: false,
        remoteBranchSkippedReason:
            'remote cleanup failed after local branch handling.',
        removedWorktrees: worktreeArchiveSummary.removedWorktrees,
        worktreeBackupPaths: worktreeArchiveSummary.worktreeBackupPaths,
    };
}

function emptyWorktreeArchiveSummary(): {
    errors: string[];
    removedWorktrees: string[];
    worktreeBackupPaths: string[];
} {
    return {
        errors: [],
        removedWorktrees: [],
        worktreeBackupPaths: [],
    };
}

function buildApplyExceptionAfterLocalArchiveResult(
    repoRoot: string,
    branchName: string,
    localBranch: LocalDeleteResult,
    worktreeArchiveSummary: {
        errors: string[];
        removedWorktrees: string[];
        worktreeBackupPaths: string[];
    },
    error: string,
): ApplyResult {
    const archivedBranchName = localBranch.backupRef?.replace(
        /^refs\/heads\//u,
        '',
    );
    const restoreResult =
        archivedBranchName === undefined
            ? {
                  errors: [
                      'git-cleanup could not locate the local archive ref.',
                  ],
                  preservedArchiveRef: false,
                  restored: false,
              }
            : restoreArchivedBranch(
                  repoRoot,
                  branchName,
                  archivedBranchName,
                  localBranch.archivedSha,
                  localBranch.backupReflogPrefix ?? null,
              );
    const existingBackupRef = readValidatedBranchBackupRef(
        repoRoot,
        localBranch.backupRef,
        localBranch.archivedSha,
        localBranch.backupReflogPrefix ?? null,
    );
    const preservedBackupValidationErrors = readPreservedBackupValidationErrors(
        'local branch archive ref',
        restoreResult.preservedArchiveRef,
        existingBackupRef,
        localBranch.backupRef,
    );
    const localBranchStillPresent = branchRefExists(repoRoot, branchName);

    return {
        branch: branchName,
        errors: [
            ...worktreeArchiveSummary.errors,
            `remote cleanup failed after local archive: ${error}`,
            ...restoreResult.errors,
            ...preservedBackupValidationErrors,
        ],
        localBackupRef: existingBackupRef,
        localBranchDeleted:
            !localBranchStillPresent &&
            existingBackupRef !== null &&
            restoreResult.errors.length === 0 &&
            preservedBackupValidationErrors.length === 0,
        localBranchSkippedReason: restoreResult.restored
            ? 'remote cleanup failed after the local archive, so the local branch name was restored.'
            : 'remote cleanup failed after the local archive, and git-cleanup could not restore the local branch name.',
        remoteBackupRef: null,
        remoteBranchDeleted: false,
        remoteBranchSkippedReason:
            'remote cleanup failed after the local branch was archived.',
        removedWorktrees: worktreeArchiveSummary.removedWorktrees,
        worktreeBackupPaths: worktreeArchiveSummary.worktreeBackupPaths,
    };
}

function restoreLocalBranchAfterRemoteFailure(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): LocalDeleteResult {
    const archivedBranchName = localBranch.backupRef?.replace(
        /^refs\/heads\//u,
        '',
    );

    if (
        archivedBranchName === undefined ||
        !shouldCheckLocalRestoreAfterRemoteFailure(localBranch, remoteBranch)
    ) {
        return localBranch;
    }

    const restoreIssue = readLocalRestoreIssueAfterRemoteFailure(
        repoRoot,
        base,
        branch,
        remoteBranch,
    );

    if (remoteBranch.safeWithoutDelete === true && restoreIssue === null) {
        return localBranch;
    }

    if (restoreIssue !== null) {
        return restoreLocalBranchAfterIssue(
            repoRoot,
            branch.name,
            localBranch,
            restoreIssue,
        );
    }

    const restoreResult = restoreArchivedBranch(
        repoRoot,
        branch.name,
        archivedBranchName,
        localBranch.archivedSha,
        localBranch.backupReflogPrefix ?? null,
    );

    return restoreResult.restored
        ? buildRestoredLocalBranchAfterRemoteFailure(
              repoRoot,
              localBranch,
              restoreResult,
          )
        : buildUnrestoredLocalBranchAfterRemoteFailure(
              repoRoot,
              branch.name,
              localBranch,
              restoreResult,
          );
}

function readLocalRestoreIssueAfterRemoteFailure(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    remoteBranch: RemoteDeleteResult,
): null | string {
    const safeWithoutDeleteIssue = readSafeWithoutDeleteRemoteIssue(
        repoRoot,
        base,
        branch,
        remoteBranch,
    );

    if (safeWithoutDeleteIssue !== null) {
        return safeWithoutDeleteIssue;
    }

    const postRemoteSafetyIssue = readPostArchiveRepositorySafetyIssue(
        repoRoot,
        base,
    );

    return postRemoteSafetyIssue === null
        ? null
        : `remote cleanup failed after the local archive and the local repository safety proof changed (${postRemoteSafetyIssue})`;
}

function restoreArchivesAfterRemoteArchiveLocalProofIssue(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): {
    localBranch: LocalDeleteResult;
    remoteBranch: RemoteDeleteResult;
} {
    if (!localBranch.deleted || !remoteBranch.deleted) {
        return { localBranch, remoteBranch };
    }

    const postRemoteSafetyIssue = readPostArchiveRepositorySafetyIssue(
        repoRoot,
        base,
    );
    const finalWorktreeIssue = readFinalLocalArchiveWorktreeIssue(
        repoRoot,
        branch.name,
        localBranch,
    );
    const issue =
        postRemoteSafetyIssue === null
            ? finalWorktreeIssue
            : `the local repository safety proof changed after the remote archive (${postRemoteSafetyIssue})`;

    if (issue === null) {
        return { localBranch, remoteBranch };
    }

    return {
        localBranch: restoreLocalBranchAfterIssue(
            repoRoot,
            branch.name,
            localBranch,
            issue,
        ),
        remoteBranch: restoreRemoteBranchAfterIssue(
            branch,
            remoteBranch,
            issue,
        ),
    };
}

function restoreArchivesAfterFinalRemoteProofIssue(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): {
    localBranch: LocalDeleteResult;
    remoteBranch: RemoteDeleteResult;
} {
    const finalRemoteArchiveIssue = readFinalReportedRemoteArchiveIssue(
        repoRoot,
        base,
        branch,
        remoteBranch,
    );

    if (finalRemoteArchiveIssue === null) {
        return { localBranch, remoteBranch };
    }

    return {
        localBranch: localBranch.deleted
            ? restoreLocalBranchAfterIssue(
                  repoRoot,
                  branch.name,
                  localBranch,
                  finalRemoteArchiveIssue,
              )
            : localBranch,
        remoteBranch: restoreRemoteBranchAfterIssue(
            branch,
            remoteBranch,
            finalRemoteArchiveIssue,
        ),
    };
}

function restoreArchivesAfterFinalApplyIssue(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): {
    localBranch: LocalDeleteResult;
    remoteBranch: RemoteDeleteResult;
} {
    const issues = readFinalApplyValidationIssues(
        repoRoot,
        base,
        branch.name,
        branch,
        localBranch,
        remoteBranch,
    );

    if (issues.length === 0) {
        return { localBranch, remoteBranch };
    }

    return restoreArchivesAfterApplyIssues(
        repoRoot,
        branch,
        localBranch,
        remoteBranch,
        issues,
    );
}

function restoreArchivesAfterApplyIssues(
    repoRoot: string,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
    issues: readonly string[],
): {
    localBranch: LocalDeleteResult;
    remoteBranch: RemoteDeleteResult;
} {
    if (issues.length === 0) {
        return { localBranch, remoteBranch };
    }

    const issue = issues.join(' ');

    return {
        localBranch: localBranch.deleted
            ? restoreLocalBranchAfterIssue(
                  repoRoot,
                  branch.name,
                  localBranch,
                  issue,
              )
            : localBranch,
        remoteBranch: remoteBranch.deleted
            ? restoreRemoteBranchAfterIssue(branch, remoteBranch, issue)
            : remoteBranch,
    };
}

function restoreLocalBranchAfterIssue(
    repoRoot: string,
    branchName: string,
    localBranch: LocalDeleteResult,
    issue: string,
): LocalDeleteResult {
    const archivedBranchName = localBranch.backupRef?.replace(
        /^refs\/heads\//u,
        '',
    );

    if (archivedBranchName === undefined) {
        return {
            ...localBranch,
            errors: [
                ...localBranch.errors,
                `${issue}, but git-cleanup could not locate the local archive ref.`,
            ],
            skippedReason: `${issue}, and git-cleanup could not restore the local branch name.`,
        };
    }

    const restoreResult = restoreArchivedBranch(
        repoRoot,
        branchName,
        archivedBranchName,
        localBranch.archivedSha,
        localBranch.backupReflogPrefix ?? null,
    );

    return restoreResult.restored
        ? buildRestoredLocalBranchAfterIssue(
              repoRoot,
              localBranch,
              restoreResult,
              `${issue}, so the local branch name was restored.`,
          )
        : buildUnrestoredLocalBranchAfterIssue(
              repoRoot,
              branchName,
              localBranch,
              restoreResult,
              `${issue}, and git-cleanup could not restore the local branch name.`,
          );
}

function shouldCheckLocalRestoreAfterRemoteFailure(
    localBranch: LocalDeleteResult,
    remoteBranch: RemoteDeleteResult,
): boolean {
    return localBranch.deleted && !remoteBranch.deleted;
}

function readSafeWithoutDeleteRemoteIssue(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    remoteBranch: RemoteDeleteResult,
): null | string {
    if (remoteBranch.safeWithoutDelete !== true) {
        return null;
    }

    if (branch.remoteBranch?.status !== 'absent') {
        return 'remote cleanup did not archive the origin branch after the local archive.';
    }

    return readAbsentRemoteSafeWithoutDeleteIssue(
        repoRoot,
        base,
        branch.remoteBranch,
    );
}

function readAbsentRemoteSafeWithoutDeleteIssue(
    repoRoot: string,
    base: BaseRef,
    remoteBranch: RemoteBranchAssessment,
): null | string {
    const validation = readAbsentRemoteSafeWithoutDeleteValidation(
        repoRoot,
        base,
        remoteBranch,
    );

    return validation === null
        ? null
        : `the absent origin branch proof changed after the local archive (${validation})`;
}

function readAbsentRemoteSafeWithoutDeleteValidation(
    repoRoot: string,
    base: BaseRef,
    remoteBranch: RemoteBranchAssessment,
): null | string {
    const latestBase = readAbsentRemoteSafeWithoutDeleteBase(repoRoot, base);

    if (typeof latestBase === 'string') {
        return latestBase;
    }

    const liveBranchProbe = readLiveOriginBranchProbe(
        repoRoot,
        remoteBranch.branch,
    );
    const latestLocalTrackingSha = readTrackedRemoteSha(
        repoRoot,
        remoteBranch.shortName,
    );
    const latestRemoteStatus = readOriginRemoteBranchStatus(
        repoRoot,
        latestBase,
        remoteBranch.branch,
        remoteBranch.shortName,
        liveBranchProbe,
        latestLocalTrackingSha,
    );

    if (latestRemoteStatus !== 'absent') {
        return readAbsentRemoteStatusChangedIssue(
            latestBase,
            remoteBranch,
            latestRemoteStatus,
        );
    }

    return readAbsentRemoteProofChangeIssue(
        repoRoot,
        latestBase,
        remoteBranch,
        latestLocalTrackingSha,
    );
}

function readAbsentRemoteSafeWithoutDeleteBase(
    repoRoot: string,
    base: BaseRef,
): BaseRef | string {
    try {
        return detectBaseRef(repoRoot, base.ref, base.remoteUrl, base);
    } catch (error) {
        return `origin could not be revalidated: ${readUnknownErrorMessage(error)}`;
    }
}

function readAbsentRemoteStatusChangedIssue(
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    latestRemoteStatus: Exclude<RemoteBranchStatus, 'absent'>,
): string {
    return latestRemoteStatus === 'safe'
        ? `the live origin branch ${remoteBranch.shortName} reappeared before final validation`
        : readRemoteDeleteSkippedReason(
              latestBase.shortName,
              remoteBranch.shortName,
              latestRemoteStatus,
          );
}

function readAbsentRemoteProofChangeIssue(
    repoRoot: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    latestLocalTrackingSha: null | string,
): null | string {
    const trackingIssue = readRemoteArchiveLocalTrackingProofIssue(
        repoRoot,
        latestBase,
        remoteBranch,
    );

    if (trackingIssue !== null) {
        return trackingIssue;
    }

    if (remoteBranch.remoteSafetyProofFingerprint === null) {
        return null;
    }

    const latestRemoteSafetyProofFingerprint = readRemoteSafetyProofFingerprint(
        repoRoot,
        latestBase,
        remoteBranch.branch,
        remoteBranch.shortName,
        latestLocalTrackingSha,
    );

    return latestRemoteSafetyProofFingerprint ===
        remoteBranch.remoteSafetyProofFingerprint
        ? null
        : `the remote safety proof for ${remoteBranch.shortName} changed`;
}

function buildRestoredLocalBranchAfterRemoteFailure(
    repoRoot: string,
    localBranch: LocalDeleteResult,
    restoreResult: ReturnType<typeof restoreArchivedBranch>,
): LocalDeleteResult {
    return buildRestoredLocalBranchAfterIssue(
        repoRoot,
        localBranch,
        restoreResult,
        'the remote branch was not archived after the local archive, so the local branch name was restored.',
    );
}

function buildRestoredLocalBranchAfterIssue(
    repoRoot: string,
    localBranch: LocalDeleteResult,
    restoreResult: ReturnType<typeof restoreArchivedBranch>,
    skippedReason: string,
): LocalDeleteResult {
    const validatedBackupRef = restoreResult.preservedArchiveRef
        ? readReportedLocalBackupRef(repoRoot, localBranch)
        : null;
    const preservedBackupValidationErrors = readPreservedBackupValidationErrors(
        'local branch archive ref',
        restoreResult.preservedArchiveRef,
        validatedBackupRef,
        localBranch.backupRef,
    );

    return {
        archivedSha:
            validatedBackupRef === null ? null : localBranch.archivedSha,
        backupRef: validatedBackupRef,
        backupReflogPrefix:
            validatedBackupRef === null
                ? null
                : (localBranch.backupReflogPrefix ?? null),
        deleted: false,
        errors: [
            ...localBranch.errors,
            ...restoreResult.errors,
            ...preservedBackupValidationErrors,
        ],
        skippedReason,
    };
}

function buildUnrestoredLocalBranchAfterRemoteFailure(
    repoRoot: string,
    branchName: string,
    localBranch: LocalDeleteResult,
    restoreResult: ReturnType<typeof restoreArchivedBranch>,
): LocalDeleteResult {
    return buildUnrestoredLocalBranchAfterIssue(
        repoRoot,
        branchName,
        localBranch,
        restoreResult,
        'the remote branch was not archived after the local archive, and git-cleanup could not restore the local branch name.',
    );
}

function buildUnrestoredLocalBranchAfterIssue(
    repoRoot: string,
    branchName: string,
    localBranch: LocalDeleteResult,
    restoreResult: ReturnType<typeof restoreArchivedBranch>,
    skippedReason: string,
): LocalDeleteResult {
    const existingBackupRef = readReportedLocalBackupRef(repoRoot, localBranch);
    const preservedBackupValidationErrors = readPreservedBackupValidationErrors(
        'local branch archive ref',
        restoreResult.preservedArchiveRef,
        existingBackupRef,
        localBranch.backupRef,
    );

    return {
        ...localBranch,
        archivedSha:
            existingBackupRef === null ? null : localBranch.archivedSha,
        backupRef: existingBackupRef,
        backupReflogPrefix:
            existingBackupRef === null
                ? null
                : (localBranch.backupReflogPrefix ?? null),
        deleted: false,
        errors: [
            ...localBranch.errors,
            ...restoreResult.errors,
            ...preservedBackupValidationErrors,
        ],
        skippedReason,
    };
}

function readPreservedBackupValidationErrors(
    label: string,
    preservedArchiveRef: boolean,
    validatedBackupRef: null | string,
    backupRef: null | string,
): string[] {
    return preservedArchiveRef && validatedBackupRef === null
        ? [
              `${label} ${backupRef ?? '(unknown)'} was preserved during restoration but could not be revalidated.`,
          ]
        : [];
}

function readRevalidatedBranchReport(
    repoRoot: string,
    expectedBase: BaseRef,
    branchName: string,
): BranchAuditSnapshot {
    assertNoHistoryRewriteOverlays(repoRoot);
    const base = detectBaseRef(
        repoRoot,
        expectedBase.ref,
        expectedBase.remoteUrl,
        expectedBase,
    );
    const unreachableCommitAnalysis =
        readRepositoryUnreachableCommitAnalysis(repoRoot);
    const repositoryReflogAnalysis = readRepositoryReflogAnalysis(
        repoRoot,
        base.liveSha,
    );
    const hiddenRefAnalysis = readReachableHiddenRefAnalysis(
        repoRoot,
        base.liveSha,
    );
    const worktrees = listWorktrees(repoRoot);

    return {
        base,
        report: buildBranchReport(
            repoRoot,
            base,
            branchName,
            worktrees,
            buildDetachedWorktreeReports(
                repoRoot,
                base,
                worktrees,
                hiddenRefAnalysis,
                repositoryReflogAnalysis,
                unreachableCommitAnalysis,
            ),
            hiddenRefAnalysis,
            repositoryReflogAnalysis,
            unreachableCommitAnalysis,
        ),
    };
}

function buildApplyBlockedResult(
    branchName: string,
    error: string,
    skippedReason: string,
): ApplyResult {
    return {
        branch: branchName,
        errors: [error],
        localBackupRef: null,
        localBranchDeleted: false,
        localBranchSkippedReason: skippedReason,
        remoteBackupRef: null,
        remoteBranchDeleted: false,
        remoteBranchSkippedReason: skippedReason,
        removedWorktrees: [],
        worktreeBackupPaths: [],
    };
}

function archiveSafeLinkedWorktrees(
    repoRoot: string,
    linkedWorktrees: readonly WorktreeInfo[],
): {
    errors: string[];
    removedWorktrees: string[];
    worktreeBackupPaths: string[];
} {
    const removedWorktrees = removeLinkedWorktrees(repoRoot, linkedWorktrees);

    return {
        errors: removedWorktrees.flatMap((worktree) =>
            worktree.result.ok
                ? []
                : [`worktree ${worktree.path}: ${worktree.result.error}`],
        ),
        removedWorktrees: removedWorktrees
            .filter((worktree) => worktree.result.ok)
            .map((worktree) => worktree.path),
        worktreeBackupPaths: removedWorktrees.flatMap((worktree) =>
            worktree.backupPath === null ? [] : [worktree.backupPath],
        ),
    };
}

function removeLinkedWorktrees(
    repoRoot: string,
    linkedWorktrees: readonly WorktreeInfo[],
): WorktreeRemovalResult[] {
    const removedWorktrees: WorktreeRemovalResult[] = [];

    for (const worktree of linkedWorktrees) {
        if (canAutoRemoveWorktree(worktree)) {
            removedWorktrees.push(archiveLinkedWorktree(repoRoot, worktree));
        }
    }

    return removedWorktrees;
}

function archiveLinkedWorktree(
    repoRoot: string,
    worktree: WorktreeInfo,
): WorktreeRemovalResult {
    const currentWorktree = listWorktrees(repoRoot).find(
        (candidate) => candidate.path === worktree.path,
    );

    if (currentWorktree === undefined) {
        return {
            backupPath: null,
            path: worktree.path,
            result: toFailedGitResult('worktree disappeared before archival.'),
        };
    }

    if (!canAutoRemoveWorktree(currentWorktree)) {
        return {
            backupPath: null,
            path: currentWorktree.path,
            result: toFailedGitResult(
                'worktree is no longer clean and cannot be archived automatically.',
            ),
        };
    }

    const archivePlan = readLinkedWorktreeArchivePlan(currentWorktree);

    if (typeof archivePlan === 'string') {
        return {
            backupPath: null,
            path: currentWorktree.path,
            result: toFailedGitResult(archivePlan),
        };
    }

    return performLinkedWorktreeArchive(repoRoot, currentWorktree, archivePlan);
}

function toFailedGitResult(error: string): GitCommandFailure {
    return {
        error,
        ok: false,
        stdout: '',
    };
}

function archiveBranchRefTransaction(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: string,
    protectedRefs: readonly ProtectedArchiveRef[] = [],
    expectedSourceReflog: null | string = null,
): GitCommandResult {
    try {
        const expectedSourceReflogPath = writeExpectedReflogTempFile(
            repoPath,
            expectedSourceReflog,
        );

        try {
            const output = execFileSync(
                process.execPath,
                [
                    '-e',
                    ARCHIVE_BRANCH_REF_TRANSACTION_SCRIPT,
                    repoPath,
                    originalBranchName,
                    archivedBranchName,
                    expectedBranchSha,
                    JSON.stringify(protectedRefs),
                    expectedSourceReflogPath ?? '',
                ],
                {
                    encoding: 'utf8',
                    env: GIT_DISABLED_REWRITE_ENV,
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            ).trim();

            return parseArchiveBranchRefTransactionResult(output);
        } finally {
            if (expectedSourceReflogPath !== null) {
                rmSync(expectedSourceReflogPath, { force: true });
            }
        }
    } catch (error) {
        const stderr = readProcessOutput(error, 'stderr');
        const stdout = readProcessOutput(error, 'stdout');

        return toFailedGitResult(
            stderr === '' ? stdout || readUnknownErrorMessage(error) : stderr,
        );
    }
}

function restoreBranchRefTransaction(
    repoPath: string,
    originalBranchName: string,
    targetBranchSha: string,
    expectedReflogPrefix: null | string,
): GitCommandResult {
    try {
        const expectedReflogPath = writeExpectedReflogTempFile(
            repoPath,
            expectedReflogPrefix,
        );

        try {
            const output = execFileSync(
                process.execPath,
                [
                    '-e',
                    RESTORE_BRANCH_REF_TRANSACTION_SCRIPT,
                    repoPath,
                    originalBranchName,
                    targetBranchSha,
                    expectedReflogPath ?? '',
                ],
                {
                    encoding: 'utf8',
                    env: GIT_DISABLED_REWRITE_ENV,
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            ).trim();

            return parseArchiveBranchRefTransactionResult(output);
        } finally {
            if (expectedReflogPath !== null) {
                rmSync(expectedReflogPath, { force: true });
            }
        }
    } catch (error) {
        const stderr = readProcessOutput(error, 'stderr');
        const stdout = readProcessOutput(error, 'stdout');

        return toFailedGitResult(
            stderr === '' ? stdout || readUnknownErrorMessage(error) : stderr,
        );
    }
}

function writeExpectedReflogTempFile(
    repoPath: string,
    expectedReflogPrefix: null | string,
): null | string {
    if (expectedReflogPrefix === null) {
        return null;
    }

    const gitDirectories = readGitDirectories(repoPath);
    const tempRoot = gitDirectories?.commonGitDir ?? repoPath;
    const tempPath = join(
        tempRoot,
        `slop-refinery-restore-reflog-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`,
    );

    writeFileSync(tempPath, Buffer.from(expectedReflogPrefix, 'latin1'), {
        flag: 'wx',
    });

    return tempPath;
}

function parseArchiveBranchRefTransactionResult(
    output: string,
): GitCommandResult {
    try {
        const parsedResult: unknown = JSON.parse(output);

        if (
            typeof parsedResult === 'object' &&
            parsedResult !== null &&
            Reflect.get(parsedResult, 'ok') === true
        ) {
            return {
                ok: true,
                stdout: '',
            };
        }

        if (typeof parsedResult !== 'object' || parsedResult === null) {
            return toFailedGitResult(
                'archive ref transaction returned a non-object result.',
            );
        }

        const error = Reflect.get(parsedResult, 'error');

        return toFailedGitResult(
            typeof error === 'string'
                ? error
                : 'archive ref transaction failed without an error message.',
        );
    } catch (error) {
        return toFailedGitResult(
            `archive ref transaction returned invalid output: ${output || readUnknownErrorMessage(error)}`,
        );
    }
}

function readLinkedWorktreeArchivePlan(
    currentWorktree: WorktreeInfo,
): LinkedWorktreeArchivePlan | string {
    const gitDirResult = tryGit(currentWorktree.path, [
        'rev-parse',
        '--absolute-git-dir',
    ]);

    if (!gitDirResult.ok || gitDirResult.stdout === '') {
        return 'unable to resolve linked worktree git metadata before archival.';
    }

    const archivedGitMetadata = readArchivedGitMetadata(gitDirResult.stdout);

    if (archivedGitMetadata === null) {
        return 'unable to resolve linked worktree common git directory before archival.';
    }

    return {
        backupPath: readWorktreeBackupPath(currentWorktree.path),
        commonGitDir: archivedGitMetadata.commonGitDir,
        gitDir: gitDirResult.stdout,
        sourceArchivePath: `${currentWorktree.path}.git-cleanup-source-${buildBackupStamp()}-${Math.random()
            .toString(16)
            .slice(2, 2 + BACKUP_SUFFIX_LENGTH)}`,
    };
}

function readArchivedGitMetadata(gitDir: string): {
    commonGitDir: string;
} | null {
    const commonDirPath = join(gitDir, 'commondir');

    if (!existsSync(commonDirPath)) {
        return null;
    }

    try {
        const relativeCommonDir = readFileSync(commonDirPath, 'utf8').trim();

        return relativeCommonDir === ''
            ? null
            : {
                  commonGitDir: resolve(gitDir, relativeCommonDir),
              };
    } catch {
        return null;
    }
}

function performLinkedWorktreeArchive(
    repoRoot: string,
    currentWorktree: WorktreeInfo,
    archivePlan: LinkedWorktreeArchivePlan,
): WorktreeRemovalResult {
    const backupFailure = createAndValidateArchivedWorktreeBackup(
        currentWorktree,
        archivePlan,
    );

    if (backupFailure !== null) {
        return buildArchiveFailureResult(
            currentWorktree.path,
            null,
            backupFailure,
        );
    }

    const refreshedWorktree = readArchivableLinkedWorktree(
        repoRoot,
        currentWorktree.path,
    );

    if (typeof refreshedWorktree === 'string') {
        discardArchivedWorktree(archivePlan.backupPath);
        return buildArchiveFailureResult(
            currentWorktree.path,
            null,
            refreshedWorktree,
        );
    }

    const stageFailure = stageLinkedWorktreeForArchive(
        refreshedWorktree.path,
        archivePlan.sourceArchivePath,
    );

    if (stageFailure !== null) {
        discardArchivedWorktree(archivePlan.backupPath);
        return buildArchiveFailureResult(
            refreshedWorktree.path,
            null,
            stageFailure,
        );
    }

    const finalizeFailure = finalizeLinkedWorktreeArchive(
        repoRoot,
        refreshedWorktree.path,
        archivePlan,
    );

    if (finalizeFailure !== null) {
        return finalizeFailure;
    }

    return {
        backupPath: archivePlan.backupPath,
        path: currentWorktree.path,
        result: {
            ok: true,
            stdout: '',
        },
    };
}

function createAndValidateArchivedWorktreeBackup(
    currentWorktree: WorktreeInfo,
    archivePlan: LinkedWorktreeArchivePlan,
): null | string {
    const backupCreationError = createArchivedWorktreeBackup(
        currentWorktree,
        archivePlan,
    );

    if (backupCreationError !== null) {
        discardArchivedWorktree(archivePlan.backupPath);
        return backupCreationError;
    }

    const archiveValidation = validateArchivedWorktree(archivePlan.backupPath);

    if (archiveValidation.ok && archiveValidation.stdout === 'true') {
        return null;
    }

    discardArchivedWorktree(archivePlan.backupPath);
    return archiveValidation.ok
        ? 'archived linked worktree backup is not usable as a git checkout.'
        : `unable to validate archived linked worktree backup: ${archiveValidation.error}`;
}

function createArchivedWorktreeBackup(
    currentWorktree: WorktreeInfo,
    archivePlan: LinkedWorktreeArchivePlan,
): null | string {
    try {
        cpSync(currentWorktree.path, archivePlan.backupPath, {
            errorOnExist: true,
            force: false,
            recursive: true,
        });
        finalizeArchivedWorktreeBackup(archivePlan.backupPath, archivePlan);
        return null;
    } catch (error) {
        return `unable to create linked worktree backup at ${archivePlan.backupPath}: ${readUnknownErrorMessage(error)}`;
    }
}

function finalizeArchivedWorktreeBackup(
    backupPath: string,
    archivePlan: LinkedWorktreeArchivePlan,
): void {
    const backupGitPath = join(backupPath, '.git');

    rmSync(backupGitPath, {
        force: true,
        recursive: true,
    });
    cpSync(archivePlan.gitDir, backupGitPath, {
        errorOnExist: true,
        force: false,
        recursive: true,
    });
    writeFileSync(
        join(backupGitPath, 'commondir'),
        `${archivePlan.commonGitDir}\n`,
    );

    const gitDirPointerPath = join(backupGitPath, 'gitdir');

    if (existsSync(gitDirPointerPath)) {
        rmSync(gitDirPointerPath, {
            force: true,
            recursive: true,
        });
    }
}

function discardArchivedWorktree(backupPath: string): void {
    if (!existsSync(backupPath)) {
        return;
    }

    try {
        rmSync(backupPath, {
            force: true,
            recursive: true,
        });
    } catch {
        // Best-effort cleanup only. Preservation failures are reported elsewhere.
    }
}

function validateArchivedWorktree(backupPath: string): GitCommandResult {
    const insideWorktree = tryGit(backupPath, [
        'rev-parse',
        '--is-inside-work-tree',
    ]);

    if (!insideWorktree.ok || insideWorktree.stdout !== 'true') {
        return insideWorktree;
    }

    const statusLines = readWorktreeStatusLines(backupPath, false);

    return statusLines.length === 0
        ? { ok: true, stdout: 'true' }
        : toFailedGitResult(
              `worktree checkout at ${backupPath} still has local state: ${statusLines.join('; ')}`,
          );
}

function buildArchiveFailureResult(
    originalPath: string,
    preservedPath: null | string,
    message: string,
): WorktreeRemovalResult {
    return {
        backupPath: preservedPath,
        path: originalPath,
        result: toFailedGitResult(message),
    };
}

function readArchivableLinkedWorktree(
    repoRoot: string,
    worktreePath: string,
): string | WorktreeInfo {
    const refreshedWorktree = listWorktrees(repoRoot).find(
        (candidate) => candidate.path === worktreePath,
    );

    if (refreshedWorktree === undefined) {
        return 'worktree disappeared before linked-worktree archival could finish.';
    }

    return canAutoRemoveWorktree(refreshedWorktree)
        ? refreshedWorktree
        : 'worktree is no longer clean and cannot be archived automatically.';
}

function stageLinkedWorktreeForArchive(
    originalPath: string,
    sourceArchivePath: string,
): null | string {
    try {
        renameSync(originalPath, sourceArchivePath);
    } catch (error) {
        return `unable to stage linked worktree ${originalPath} for archival: ${readUnknownErrorMessage(error)}`;
    }

    const stagedStatusLines = readWorktreeStatusLines(sourceArchivePath, false);

    if (stagedStatusLines.length === 0) {
        return null;
    }

    const restoreResult = restoreStagedLinkedWorktree(
        originalPath,
        sourceArchivePath,
        `linked worktree changed while archival was in progress (${stagedStatusLines.length} signal(s)).`,
    ).result;

    return restoreResult.ok ? null : restoreResult.error;
}

function restoreStagedLinkedWorktree(
    originalPath: string,
    sourceArchivePath: string,
    message: string,
): WorktreeRemovalResult {
    try {
        renameSync(sourceArchivePath, originalPath);
        return buildArchiveFailureResult(originalPath, null, message);
    } catch (error) {
        return buildArchiveFailureResult(
            originalPath,
            sourceArchivePath,
            `${message} The staged source checkout is preserved at ${sourceArchivePath}: ${readUnknownErrorMessage(error)}`,
        );
    }
}

function finalizeLinkedWorktreeArchive(
    repoRoot: string,
    originalPath: string,
    archivePlan: LinkedWorktreeArchivePlan,
): null | WorktreeRemovalResult {
    const pruneResult = tryGit(repoRoot, [
        'worktree',
        'prune',
        '--expire',
        'now',
    ]);

    if (!pruneResult.ok) {
        discardArchivedWorktree(archivePlan.backupPath);
        return restoreStagedLinkedWorktree(
            originalPath,
            archivePlan.sourceArchivePath,
            `unable to prune linked worktree metadata after archival: ${pruneResult.error}`,
        );
    }

    try {
        rmSync(archivePlan.sourceArchivePath, {
            force: true,
            recursive: true,
        });
        return null;
    } catch (error) {
        return buildArchiveFailureResult(
            originalPath,
            archivePlan.backupPath,
            `linked worktree backup is ready at ${archivePlan.backupPath}, but the temporary source checkout at ${archivePlan.sourceArchivePath} could not be removed: ${readUnknownErrorMessage(error)}`,
        );
    }
}

function deleteLocalBranch(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    canDelete: boolean,
): LocalDeleteResult {
    if (!canDelete) {
        return {
            archivedSha: null,
            backupRef: null,
            deleted: false,
            errors: [],
            skippedReason:
                'the branch no longer passes the automatic local-deletion safety checks.',
        };
    }

    assertNoHistoryRewriteOverlays(repoRoot);
    const refreshedBranch = readCurrentSafeDeleteBranchReport(
        repoRoot,
        base,
        branch.name,
    );

    if (refreshedBranch.classification !== 'safe_delete') {
        return {
            archivedSha: null,
            backupRef: null,
            deleted: false,
            errors: [],
            skippedReason:
                'the branch no longer passes the safety checks immediately before deletion.',
        };
    }

    if (
        !branchProofFingerprintsMatch(branch, refreshedBranch) ||
        !branchSafetyProofStillMatches(repoRoot, base, branch)
    ) {
        return {
            archivedSha: null,
            backupRef: null,
            deleted: false,
            errors: [],
            skippedReason:
                'the branch safety proof changed after the final revalidation, so local deletion was skipped.',
        };
    }

    return archiveValidatedLocalBranch(repoRoot, base, refreshedBranch);
}

function archiveValidatedLocalBranch(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
): LocalDeleteResult {
    const expectedBranchSha = readRequiredCommitSha(
        repoRoot,
        branch.name,
        `local branch ${branch.name} disappeared before deletion.`,
    );
    const expectedSourceReflog = readArchivedBranchReflog(
        repoRoot,
        branch.name,
    );

    if (
        expectedSourceReflog === null ||
        expectedSourceReflog.shas.length === 0
    ) {
        return {
            archivedSha: null,
            backupRef: null,
            deleted: false,
            errors: [
                `local branch ${branch.name}: source branch reflog could not be pinned before archive rename.`,
            ],
            skippedReason: null,
        };
    }

    const archivedBranchName = buildArchiveBranchName(
        'local',
        branch.name,
        expectedBranchSha,
    );
    const result = archiveBranchRefTransaction(
        repoRoot,
        branch.name,
        archivedBranchName,
        expectedBranchSha,
        [
            ...readCurrentHeadProtection(repoRoot),
            {
                ref: base.ref,
                sha: base.liveSha,
            },
        ],
        expectedSourceReflog.content,
    );

    if (!result.ok) {
        return {
            archivedSha: null,
            backupRef: null,
            deleted: false,
            errors: [`local branch ${branch.name}: ${result.error}`],
            skippedReason: null,
        };
    }

    const archiveValidation = readArchivedBranchValidation(
        repoRoot,
        branch.name,
        archivedBranchName,
        expectedBranchSha,
        expectedSourceReflog.content,
    );

    return buildLocalArchiveDeleteResult(
        repoRoot,
        base,
        branch.name,
        archivedBranchName,
        expectedBranchSha,
        expectedSourceReflog.content,
        archiveValidation,
    );
}

function readCurrentHeadProtection(repoPath: string): ProtectedArchiveRef[] {
    const headTarget = tryGit(repoPath, ['symbolic-ref', '-q', 'HEAD']);

    if (headTarget.ok && headTarget.stdout !== '') {
        const headSha = readRefCommitSha(repoPath, 'HEAD');

        return [
            {
                ref: 'HEAD',
                ...(headSha === null ? {} : { sha: headSha }),
                target: headTarget.stdout,
            },
        ];
    }

    const headSha = readRefCommitSha(repoPath, 'HEAD');

    return headSha === null
        ? []
        : [
              {
                  ref: 'HEAD',
                  sha: headSha,
              },
          ];
}

function readArchivedBranchValidation(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: string,
    expectedReflogPrefix: null | string = null,
): {
    archived: boolean;
    errors: string[];
} {
    const state = readArchivedBranchValidationState(
        repoPath,
        originalBranchName,
        archivedBranchName,
    );

    return {
        archived: archivedBranchStateIsValid(
            state,
            expectedBranchSha,
            expectedReflogPrefix,
        ),
        errors: readArchivedBranchValidationErrors(
            originalBranchName,
            archivedBranchName,
            expectedBranchSha,
            expectedReflogPrefix,
            state,
        ),
    };
}

function readArchivedBranchValidationState(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
): {
    archivedBranchIsSymbolic: boolean;
    archivedBranchReflog: null | ParsedReflog;
    archivedBranchSha: null | string;
    originalBranchIsSymbolic: boolean;
    originalBranchStillPresent: boolean;
} {
    const archivedBranchIsSymbolic = isBranchSymbolicRef(
        repoPath,
        archivedBranchName,
    );
    const archivedBranchSha = archivedBranchIsSymbolic
        ? null
        : readRefCommitSha(repoPath, `refs/heads/${archivedBranchName}`);

    return {
        archivedBranchIsSymbolic,
        archivedBranchReflog: archivedBranchIsSymbolic
            ? null
            : readArchivedBranchReflog(repoPath, archivedBranchName),
        archivedBranchSha,
        originalBranchIsSymbolic: isBranchSymbolicRef(
            repoPath,
            originalBranchName,
        ),
        originalBranchStillPresent: branchRefExists(
            repoPath,
            originalBranchName,
        ),
    };
}

function readArchivedBranchValidationErrors(
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: string,
    expectedReflogPrefix: null | string,
    state: ReturnType<typeof readArchivedBranchValidationState>,
): string[] {
    return [
        ...readOriginalBranchArchiveValidationErrors(originalBranchName, state),
        ...readArchivedBranchRefValidationErrors(
            archivedBranchName,
            expectedBranchSha,
            expectedReflogPrefix,
            state,
        ),
    ];
}

function readOriginalBranchArchiveValidationErrors(
    originalBranchName: string,
    state: ReturnType<typeof readArchivedBranchValidationState>,
): string[] {
    return [
        ...(state.originalBranchStillPresent
            ? [
                  `local branch ${originalBranchName} still exists after archive rename.`,
              ]
            : []),
        ...(state.originalBranchIsSymbolic
            ? [
                  `local branch ${originalBranchName} is symbolic after archive rename.`,
              ]
            : []),
    ];
}

function readArchivedBranchRefValidationErrors(
    archivedBranchName: string,
    expectedBranchSha: string,
    expectedReflogPrefix: null | string,
    state: ReturnType<typeof readArchivedBranchValidationState>,
): string[] {
    return [
        ...(state.archivedBranchIsSymbolic
            ? [
                  `archived branch refs/heads/${archivedBranchName} is symbolic after archive rename.`,
              ]
            : []),
        ...(state.archivedBranchSha === expectedBranchSha
            ? []
            : [
                  `archived branch refs/heads/${archivedBranchName} did not verify at ${expectedBranchSha.slice(0, 7)}.`,
              ]),
        ...readArchivedBranchReflogValidationErrors(
            archivedBranchName,
            state.archivedBranchReflog,
            expectedBranchSha,
            expectedReflogPrefix,
        ),
    ];
}

function readArchivedBranchReflogValidationErrors(
    archivedBranchName: string,
    archivedBranchReflog: null | ParsedReflog,
    expectedBranchSha: string,
    expectedReflogPrefix: null | string,
): string[] {
    if (archivedBranchReflog === null) {
        return [
            `archived branch refs/heads/${archivedBranchName} is missing its reflog after rename.`,
        ];
    }

    return [
        ...(archivedBranchReflog.shas.length === 0
            ? [
                  `archived branch refs/heads/${archivedBranchName} has an empty reflog after rename.`,
              ]
            : []),
        ...(expectedReflogPrefix !== null &&
        !archivedBranchReflog.content.startsWith(expectedReflogPrefix)
            ? [
                  `archived branch refs/heads/${archivedBranchName} reflog did not preserve the source branch reflog after rename.`,
              ]
            : []),
        ...(expectedReflogPrefix !== null &&
        !reflogSuffixContainsOnlyExpectedSha(
            archivedBranchReflog.content,
            expectedReflogPrefix,
            expectedBranchSha,
        )
            ? [
                  `archived branch refs/heads/${archivedBranchName} reflog contains unexpected entries after the preserved source branch reflog.`,
              ]
            : []),
    ];
}

function archivedBranchStateIsValid(
    state: ReturnType<typeof readArchivedBranchValidationState>,
    expectedBranchSha: string,
    expectedReflogPrefix: null | string,
): boolean {
    return (
        !state.originalBranchStillPresent &&
        !state.originalBranchIsSymbolic &&
        !state.archivedBranchIsSymbolic &&
        state.archivedBranchSha === expectedBranchSha &&
        state.archivedBranchReflog !== null &&
        state.archivedBranchReflog.shas.length > 0 &&
        (expectedReflogPrefix === null ||
            (state.archivedBranchReflog.content.startsWith(
                expectedReflogPrefix,
            ) &&
                reflogSuffixContainsOnlyExpectedSha(
                    state.archivedBranchReflog.content,
                    expectedReflogPrefix,
                    expectedBranchSha,
                )))
    );
}

function readExistingBranchBackupRef(
    repoPath: string,
    backupRef: null | string,
): null | string {
    if (backupRef === null) {
        return null;
    }

    const branchName = backupRef.replace(/^refs\/heads\//u, '');

    return !isBranchSymbolicRef(repoPath, branchName) &&
        branchRefExists(repoPath, branchName)
        ? backupRef
        : null;
}

function readReportedLocalBackupRef(
    repoPath: string,
    localBranch: LocalDeleteResult,
): null | string {
    return readValidatedBranchBackupRef(
        repoPath,
        localBranch.backupRef,
        localBranch.archivedSha,
        localBranch.backupReflogPrefix ?? null,
    );
}

function readReportedRemoteBackupRef(
    remoteBranch: RemoteDeleteResult,
): null | string {
    if (
        remoteBranch.backupRepoPath === undefined ||
        remoteBranch.backupRepoPath === null
    ) {
        return null;
    }

    return readValidatedBranchBackupRef(
        remoteBranch.backupRepoPath,
        remoteBranch.backupRef,
        remoteBranch.archivedSha ?? null,
        remoteBranch.backupReflogPrefix ?? null,
    );
}

function readValidatedBranchBackupRef(
    repoPath: string,
    backupRef: null | string,
    expectedBranchSha: null | string,
    expectedReflogPrefix: null | string,
): null | string {
    const existingBackupRef = readExistingBranchBackupRef(repoPath, backupRef);

    if (existingBackupRef === null) {
        return null;
    }

    const branchName = existingBackupRef.replace(/^refs\/heads\//u, '');
    const branchSha = readRefCommitSha(repoPath, existingBackupRef);
    const backupReflog = readArchivedBranchReflog(repoPath, branchName);

    if (expectedBranchSha !== null && branchSha !== expectedBranchSha) {
        return null;
    }

    if (
        expectedReflogPrefix !== null &&
        (backupReflog === null ||
            !backupReflog.content.startsWith(expectedReflogPrefix) ||
            (expectedBranchSha !== null &&
                !reflogSuffixContainsOnlyExpectedSha(
                    backupReflog.content,
                    expectedReflogPrefix,
                    expectedBranchSha,
                )))
    ) {
        return null;
    }

    return existingBackupRef;
}

function reflogSuffixContainsOnlyExpectedSha(
    reflogContent: string,
    expectedReflogPrefix: string,
    expectedBranchSha: string,
): boolean {
    if (!reflogContent.startsWith(expectedReflogPrefix)) {
        return false;
    }

    const suffix = reflogContent.slice(expectedReflogPrefix.length);

    if (suffix.trim() === '') {
        return true;
    }

    const parsedSuffix = parseReflogShas(suffix);

    return (
        parsedSuffix !== null &&
        parsedSuffix.shas.every((sha) => sha === expectedBranchSha)
    );
}

function branchRefExists(repoPath: string, branchName: string): boolean {
    return gitSucceeded(repoPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${branchName}`,
    ]);
}

export function validateArchivedBranchForTesting(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: string,
    expectedReflogPrefix: null | string = null,
): {
    archived: boolean;
    errors: string[];
} {
    return readArchivedBranchValidation(
        repoPath,
        originalBranchName,
        archivedBranchName,
        expectedBranchSha,
        expectedReflogPrefix,
    );
}

export function restoreArchivedBranchForTesting(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: null | string = null,
    expectedReflogPrefix: null | string = null,
): {
    errors: string[];
    preservedArchiveRef: boolean;
    restored: boolean;
} {
    return restoreArchivedBranch(
        repoPath,
        originalBranchName,
        archivedBranchName,
        expectedBranchSha,
        expectedReflogPrefix,
    );
}

export function archiveBranchRefTransactionForTesting(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: string,
    protectedRefs: readonly ProtectedArchiveRef[] = [],
    expectedSourceReflog: null | string = null,
): GitCommandResult {
    return archiveBranchRefTransaction(
        repoPath,
        originalBranchName,
        archivedBranchName,
        expectedBranchSha,
        protectedRefs,
        expectedSourceReflog,
    );
}

function readPostArchiveRepositorySafetyIssue(
    repoPath: string,
    base: BaseRef,
): null | string {
    try {
        const baseIssue = readLiveBaseValidationIssue(repoPath, base);

        return baseIssue ?? readHistoryRewriteOverlayIssue(repoPath);
    } catch (error) {
        return readUnknownErrorMessage(error);
    }
}

function readRepositoryWideSafetyIssue(
    repoPath: string,
    baseRef: string,
): null | string {
    const overlayIssue = readHistoryRewriteOverlayIssue(repoPath);

    if (overlayIssue !== null) {
        return overlayIssue;
    }

    return (
        readRepositoryWideWorktreeIssue(repoPath) ??
        readRepositoryWideDetachedWorktreeIssue(repoPath, baseRef) ??
        readRepositoryWideHiddenRefIssue(repoPath, baseRef) ??
        readRepositoryWideReflogIssue(repoPath, baseRef) ??
        readRepositoryWideUnreachableCommitIssue(repoPath)
    );
}

function readRepositoryWideDetachedWorktreeIssue(
    repoPath: string,
    baseRef: string,
): null | string {
    const detachedWorktrees = readCurrentDetachedWorktreeReports(repoPath, {
        branchName: 'unknown',
        liveSha: baseRef,
        localSha: baseRef,
        ref: baseRef,
        remoteUrl: 'unknown',
        shortName: 'canonical base',
        source: 'origin_live_head',
    });
    const blockingDetachedWorktrees = detachedWorktrees.filter(
        (worktree) => !worktree.state.safeToRemoveManually,
    );

    return blockingDetachedWorktrees.length === 0
        ? null
        : 'the repository has detached worktree state that requires manual review.';
}

function readRepositoryWideWorktreeIssue(repoPath: string): null | string {
    const worktrees = readWorktreesSafely(repoPath);

    if (worktrees === null) {
        return 'the repository-wide worktree state could not be revalidated.';
    }

    const linkedWorktreePaths = readRepositoryLinkedWorktreePaths(worktrees);

    if (linkedWorktreePaths.length > 0) {
        return 'the repository gained linked worktree state.';
    }

    return readRepositoryDirtyWorktrees(worktrees).length > 0
        ? 'the repository gained dirty, missing, or prunable worktree state.'
        : null;
}

function restoreArchivedBranch(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: null | string,
    expectedReflogPrefix: null | string = null,
): {
    errors: string[];
    preservedArchiveRef: boolean;
    restored: boolean;
} {
    const archivedBranchIsSymbolic = isBranchSymbolicRef(
        repoPath,
        archivedBranchName,
    );
    const archivedBranchSha = archivedBranchIsSymbolic
        ? null
        : readRefCommitSha(repoPath, `refs/heads/${archivedBranchName}`);
    const archivedBranchExists =
        archivedBranchIsSymbolic ||
        branchRefExists(repoPath, archivedBranchName);
    const targetBranchSha = archivedBranchIsSymbolic
        ? expectedBranchSha
        : readRestoreTargetBranchSha(
              repoPath,
              archivedBranchName,
              expectedBranchSha,
          );

    if (expectedBranchSha !== null && !archivedBranchExists) {
        return {
            errors: [
                `git-cleanup could not restore ${originalBranchName} because archive branch refs/heads/${archivedBranchName} disappeared before restoration.`,
            ],
            preservedArchiveRef: false,
            restored: false,
        };
    }

    if (archivedBranchSha !== null) {
        if (expectedBranchSha !== null) {
            return runPinnedArchivedBranchRestore(
                repoPath,
                originalBranchName,
                archivedBranchName,
                expectedBranchSha,
                expectedReflogPrefix,
                archivedBranchExists,
            );
        }

        return runArchivedBranchRenameRestore(
            repoPath,
            originalBranchName,
            archivedBranchName,
            archivedBranchSha,
            expectedReflogPrefix,
        );
    }

    if (targetBranchSha === null) {
        return {
            errors: [
                `git-cleanup could not determine which commit ${archivedBranchName} should restore to ${originalBranchName}.`,
            ],
            preservedArchiveRef: archivedBranchExists,
            restored: false,
        };
    }

    return runPinnedArchivedBranchRestore(
        repoPath,
        originalBranchName,
        archivedBranchName,
        targetBranchSha,
        expectedReflogPrefix,
        archivedBranchExists,
    );
}

function readRestoreTargetBranchSha(
    repoPath: string,
    archivedBranchName: string,
    expectedBranchSha: null | string,
): null | string {
    return (
        expectedBranchSha ??
        readRefCommitSha(repoPath, `refs/heads/${archivedBranchName}`)
    );
}

function runArchivedBranchRenameRestore(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    targetBranchSha: string,
    expectedReflogPrefix: null | string,
): {
    errors: string[];
    preservedArchiveRef: boolean;
    restored: boolean;
} {
    const restoreResult = tryGit(repoPath, [
        'branch',
        '-m',
        archivedBranchName,
        originalBranchName,
    ]);

    if (!restoreResult.ok) {
        return {
            errors: [
                `git-cleanup could not restore ${originalBranchName} from ${archivedBranchName}: ${restoreResult.error}`,
            ],
            preservedArchiveRef: true,
            restored: false,
        };
    }

    return readRestoredBranchValidation(
        repoPath,
        originalBranchName,
        archivedBranchName,
        targetBranchSha,
        expectedReflogPrefix,
        false,
    );
}

function runPinnedArchivedBranchRestore(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    targetBranchSha: string,
    expectedReflogPrefix: null | string,
    preserveArchiveRef: boolean,
): {
    errors: string[];
    preservedArchiveRef: boolean;
    restored: boolean;
} {
    if (
        !gitSucceeded(repoPath, [
            'cat-file',
            '-e',
            `${targetBranchSha}^{commit}`,
        ])
    ) {
        return {
            errors: [
                `git-cleanup could not restore ${originalBranchName} because commit ${targetBranchSha.slice(0, 7)} is no longer available.`,
            ],
            preservedArchiveRef: preserveArchiveRef,
            restored: false,
        };
    }

    const updateRefResult = restoreBranchRefTransaction(
        repoPath,
        originalBranchName,
        targetBranchSha,
        expectedReflogPrefix,
    );

    if (!updateRefResult.ok) {
        return {
            errors: [
                `git-cleanup could not recreate ${originalBranchName} at ${targetBranchSha.slice(0, 7)}: ${updateRefResult.error}`,
            ],
            preservedArchiveRef: preserveArchiveRef,
            restored: false,
        };
    }

    return readRestoredBranchValidation(
        repoPath,
        originalBranchName,
        archivedBranchName,
        targetBranchSha,
        expectedReflogPrefix,
        preserveArchiveRef,
    );
}

function readRestoredBranchValidation(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
    targetBranchSha: string,
    expectedReflogPrefix: null | string,
    allowArchivedBranchPreservation: boolean,
): {
    errors: string[];
    preservedArchiveRef: boolean;
    restored: boolean;
} {
    const restoredBranchSha = readRefCommitSha(
        repoPath,
        `refs/heads/${originalBranchName}`,
    );
    const restoredBranchIsSymbolic = isBranchSymbolicRef(
        repoPath,
        originalBranchName,
    );
    const archivedBranchIsSymbolic = isBranchSymbolicRef(
        repoPath,
        archivedBranchName,
    );
    const archivedBranchStillPresent =
        archivedBranchIsSymbolic ||
        branchRefExists(repoPath, archivedBranchName);
    const restoredBranchReflog = readArchivedBranchReflog(
        repoPath,
        originalBranchName,
    );
    const errors = [
        ...readRestoredBranchShaValidationErrors(
            originalBranchName,
            restoredBranchSha,
            targetBranchSha,
        ),
        ...readRestoredBranchSymbolicValidationErrors(
            originalBranchName,
            restoredBranchIsSymbolic,
        ),
        ...readArchivedRefRestorationErrors(
            archivedBranchName,
            archivedBranchStillPresent,
            archivedBranchIsSymbolic,
            allowArchivedBranchPreservation,
        ),
        ...readRestoredBranchReflogValidationErrors(
            originalBranchName,
            restoredBranchReflog,
            expectedReflogPrefix,
            targetBranchSha,
        ),
    ];

    return {
        errors,
        preservedArchiveRef:
            allowArchivedBranchPreservation && archivedBranchStillPresent,
        restored:
            errors.length === 0 &&
            restoredBranchSha === targetBranchSha &&
            (!archivedBranchStillPresent || allowArchivedBranchPreservation) &&
            restoredBranchReflog !== null &&
            restoredBranchReflog.shas.length > 0 &&
            (expectedReflogPrefix === null ||
                reflogSuffixContainsOnlyExpectedSha(
                    restoredBranchReflog.content,
                    expectedReflogPrefix,
                    targetBranchSha,
                )),
    };
}

function readRestoredBranchShaValidationErrors(
    originalBranchName: string,
    restoredBranchSha: null | string,
    targetBranchSha: string,
): string[] {
    return restoredBranchSha === targetBranchSha
        ? []
        : [
              `restored branch refs/heads/${originalBranchName} did not verify at ${targetBranchSha.slice(0, 7)}.`,
          ];
}

function readRestoredBranchSymbolicValidationErrors(
    originalBranchName: string,
    restoredBranchIsSymbolic: boolean,
): string[] {
    return restoredBranchIsSymbolic
        ? [
              `restored branch refs/heads/${originalBranchName} is symbolic after restoration.`,
          ]
        : [];
}

function readArchivedRefRestorationErrors(
    archivedBranchName: string,
    archivedBranchStillPresent: boolean,
    archivedBranchIsSymbolic: boolean,
    allowArchivedBranchPreservation: boolean,
): string[] {
    if (archivedBranchIsSymbolic) {
        return [
            `archived branch refs/heads/${archivedBranchName} is symbolic after restoration.`,
        ];
    }

    if (archivedBranchStillPresent && !allowArchivedBranchPreservation) {
        return [
            `archived branch refs/heads/${archivedBranchName} still exists after restoration.`,
        ];
    }

    return !archivedBranchStillPresent && allowArchivedBranchPreservation
        ? [
              `archived branch refs/heads/${archivedBranchName} disappeared during restoration.`,
          ]
        : [];
}

function readRestoredBranchReflogValidationErrors(
    originalBranchName: string,
    restoredBranchReflog: null | ParsedReflog,
    expectedReflogPrefix: null | string,
    targetBranchSha: string,
): string[] {
    if (restoredBranchReflog === null) {
        return [
            `restored branch refs/heads/${originalBranchName} is missing its reflog after restoration.`,
        ];
    }

    if (restoredBranchReflog.shas.length === 0) {
        return [
            `restored branch refs/heads/${originalBranchName} has an empty reflog after restoration.`,
        ];
    }

    if (expectedReflogPrefix === null) {
        return [];
    }

    if (!restoredBranchReflog.content.startsWith(expectedReflogPrefix)) {
        return [
            `restored branch refs/heads/${originalBranchName} does not preserve the expected reflog history after restoration.`,
        ];
    }

    return reflogSuffixContainsOnlyExpectedSha(
        restoredBranchReflog.content,
        expectedReflogPrefix,
        targetBranchSha,
    )
        ? []
        : [
              `restored branch refs/heads/${originalBranchName} reflog contains unexpected entries after the preserved source branch reflog.`,
          ];
}

function buildLocalArchiveDeleteResult(
    repoRoot: string,
    base: BaseRef,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: string,
    expectedReflogPrefix: string,
    archiveValidation: {
        archived: boolean;
        errors: string[];
    },
): LocalDeleteResult {
    const backupRef = `refs/heads/${archivedBranchName}`;

    if (!archiveValidation.archived) {
        return restoreLocalArchiveAfterIssue(
            repoRoot,
            originalBranchName,
            archivedBranchName,
            expectedBranchSha,
            expectedReflogPrefix,
            backupRef,
            archiveValidation.errors,
            `the archive rename for ${originalBranchName} did not validate`,
            'the original branch name',
        );
    }

    const worktreeIssue = readArchiveBranchWorktreeIssue(
        repoRoot,
        originalBranchName,
        archivedBranchName,
    );

    if (worktreeIssue !== null) {
        return restoreLocalArchiveAfterIssue(
            repoRoot,
            originalBranchName,
            archivedBranchName,
            expectedBranchSha,
            expectedReflogPrefix,
            backupRef,
            [],
            `the archive rename for ${originalBranchName} was observed in a worktree (${worktreeIssue})`,
            'the original branch name',
        );
    }

    const postArchiveSafetyIssue = readPostArchiveRepositorySafetyIssue(
        repoRoot,
        base,
    );

    if (postArchiveSafetyIssue !== null) {
        return restoreLocalArchiveAfterIssue(
            repoRoot,
            originalBranchName,
            archivedBranchName,
            expectedBranchSha,
            expectedReflogPrefix,
            backupRef,
            [],
            `the repository-wide safety proof changed after the archive rename (${postArchiveSafetyIssue})`,
            originalBranchName,
        );
    }

    const finalWorktreeIssue = readArchiveBranchWorktreeIssue(
        repoRoot,
        originalBranchName,
        archivedBranchName,
    );

    if (finalWorktreeIssue !== null) {
        return restoreLocalArchiveAfterIssue(
            repoRoot,
            originalBranchName,
            archivedBranchName,
            expectedBranchSha,
            expectedReflogPrefix,
            backupRef,
            [],
            `the archive rename for ${originalBranchName} was observed in a worktree after repository-wide revalidation (${finalWorktreeIssue})`,
            'the original branch name',
        );
    }

    return {
        archivedSha: expectedBranchSha,
        backupRef,
        backupReflogPrefix: expectedReflogPrefix,
        deleted: true,
        errors: [],
        skippedReason: null,
    };
}

function restoreLocalArchiveAfterIssue(
    repoRoot: string,
    originalBranchName: string,
    archivedBranchName: string,
    expectedBranchSha: string,
    expectedReflogPrefix: string,
    backupRef: string,
    initialErrors: readonly string[],
    issue: string,
    restoreTargetLabel: string,
): LocalDeleteResult {
    const restoreResult = restoreArchivedBranch(
        repoRoot,
        originalBranchName,
        archivedBranchName,
        expectedBranchSha,
        expectedReflogPrefix,
    );
    const existingBackupRef = readValidatedBranchBackupRef(
        repoRoot,
        backupRef,
        expectedBranchSha,
        expectedReflogPrefix,
    );
    const preservedBackupValidationErrors = readPreservedBackupValidationErrors(
        'local branch archive ref',
        restoreResult.preservedArchiveRef,
        existingBackupRef,
        backupRef,
    );
    const originalBranchStillPresent = branchRefExists(
        repoRoot,
        originalBranchName,
    );

    return {
        archivedSha: existingBackupRef === null ? null : expectedBranchSha,
        backupRef: existingBackupRef,
        backupReflogPrefix:
            existingBackupRef === null ? null : expectedReflogPrefix,
        deleted: !originalBranchStillPresent,
        errors: [
            ...initialErrors,
            ...restoreResult.errors,
            ...preservedBackupValidationErrors,
        ],
        skippedReason: restoreResult.restored
            ? `${issue}, so the original branch name was restored.`
            : `${issue}, and git-cleanup could not restore ${restoreTargetLabel}.`,
    };
}

function readArchiveBranchWorktreeIssue(
    repoPath: string,
    originalBranchName: string,
    archivedBranchName: string,
): null | string {
    try {
        const worktree = listWorktrees(repoPath).find(
            (candidate) =>
                candidate.branchName === archivedBranchName ||
                candidate.branchName === originalBranchName,
        );

        return worktree === undefined
            ? null
            : `worktree ${worktree.path} is checked out on ${worktree.branchName ?? 'a detached HEAD'}`;
    } catch (error) {
        return `worktree state could not be revalidated: ${readUnknownErrorMessage(error)}`;
    }
}

function readRepositoryWideHiddenRefIssue(
    repoPath: string,
    baseRef: string,
): null | string {
    const hiddenRefAnalysis = readReachableHiddenRefAnalysis(repoPath, baseRef);

    if (!hiddenRefAnalysis.available) {
        return 'the repository-wide hidden-ref scan could not be revalidated.';
    }

    return hiddenRefAnalysis.refs.length > 0
        ? 'the repository gained reachable refs outside the canonical base.'
        : null;
}

function readRepositoryWideReflogIssue(
    repoPath: string,
    baseRef: string,
): null | string {
    const repositoryReflogAnalysis = readRepositoryReflogAnalysis(
        repoPath,
        baseRef,
    );

    if (!repositoryReflogAnalysis.available) {
        return 'the repository-wide reflog scan could not be revalidated.';
    }

    return repositoryReflogAnalysis.uniqueCommitCount > 0
        ? 'the repository reflogs still retain commits outside the canonical base.'
        : null;
}

function readRepositoryWideUnreachableCommitIssue(
    repoPath: string,
): null | string {
    const unreachableCommitAnalysis =
        readRepositoryUnreachableCommitAnalysis(repoPath);

    if (!unreachableCommitAnalysis.available) {
        return 'the repository-wide unreachable-object scan could not be revalidated.';
    }

    return unreachableCommitAnalysis.commitCount > 0
        ? 'the repository now has unreachable objects outside the canonical base proof.'
        : null;
}

function readArchivedBranchReflog(
    repoPath: string,
    archivedBranchName: string,
): null | ParsedReflog {
    const gitDirectories = readGitDirectories(repoPath);

    return gitDirectories === null
        ? null
        : readReflogShas(
              join(
                  gitDirectories.commonGitDir,
                  'logs',
                  'refs',
                  'heads',
                  archivedBranchName,
              ),
          );
}

function readCurrentSafeDeleteBranchReport(
    repoRoot: string,
    base: BaseRef,
    branchName: string,
): BranchReport {
    const refreshedBase = detectBaseRef(
        repoRoot,
        base.ref,
        base.remoteUrl,
        base,
    );
    const refreshedUnreachableCommitAnalysis =
        readRepositoryUnreachableCommitAnalysis(repoRoot);
    const refreshedRepositoryReflogAnalysis = readRepositoryReflogAnalysis(
        repoRoot,
        refreshedBase.liveSha,
    );
    const refreshedHiddenRefAnalysis = readReachableHiddenRefAnalysis(
        repoRoot,
        refreshedBase.liveSha,
    );
    const refreshedWorktrees = listWorktrees(repoRoot);

    return buildBranchReport(
        repoRoot,
        refreshedBase,
        branchName,
        refreshedWorktrees,
        buildDetachedWorktreeReports(
            repoRoot,
            refreshedBase,
            refreshedWorktrees,
            refreshedHiddenRefAnalysis,
            refreshedRepositoryReflogAnalysis,
            refreshedUnreachableCommitAnalysis,
        ),
        refreshedHiddenRefAnalysis,
        refreshedRepositoryReflogAnalysis,
        refreshedUnreachableCommitAnalysis,
    );
}

function branchSafetyProofStillMatches(
    repoRoot: string,
    base: BaseRef,
    expectedBranch: BranchReport,
): boolean {
    const expectedSafetyProofFingerprint =
        expectedBranch.state.safetyProofFingerprint;
    const currentSafetyProofFingerprint = readRevalidatedBranchReport(
        repoRoot,
        base,
        expectedBranch.name,
    ).report.state.safetyProofFingerprint;

    return (
        expectedSafetyProofFingerprint !== null &&
        currentSafetyProofFingerprint !== null &&
        expectedSafetyProofFingerprint === currentSafetyProofFingerprint
    );
}

function deleteRemoteBranch(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    localBranch: LocalDeleteResult,
): RemoteDeleteResult {
    assertNoHistoryRewriteOverlays(repoRoot);
    const localArchiveIssue = readLocalArchiveRemoteDeleteIssue(
        repoRoot,
        branch.name,
        localBranch,
    );

    if (localArchiveIssue !== null) {
        return buildRemoteDeleteSkippedResult(localArchiveIssue);
    }

    const hostedRemoteDelete = deleteHostedRemoteBranchIfEligible(
        repoRoot,
        base,
        branch,
    );

    if (hostedRemoteDelete !== null) {
        return hostedRemoteDelete;
    }

    const remoteArchivePreparation = prepareRemoteArchive(
        repoRoot,
        base,
        branch,
        true,
    );

    return remoteArchivePreparation.status !== 'ready'
        ? remoteArchivePreparation.result
        : archiveRemoteBranch(
              repoRoot,
              remoteArchivePreparation.remoteRepoPath,
              remoteArchivePreparation.latestBase,
              remoteArchivePreparation.remoteBranch,
              remoteArchivePreparation.liveSha,
          );
}

function deleteHostedRemoteBranchIfEligible(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
): null | RemoteDeleteResult {
    const remoteBranch = branch.remoteBranch;

    if (
        remoteBranch === null ||
        originGitDirectoryIsLocallyInspectable(repoRoot, base)
    ) {
        return null;
    }

    if (remoteBranch.status === 'absent') {
        return buildRemoteDeleteSkippedResult(
            `the live origin branch ${remoteBranch.shortName} is already absent; no remote deletion was needed.`,
            null,
            true,
        );
    }

    if (!isRemoteBranchSafeToDelete(branch.name, remoteBranch)) {
        return buildRemoteDeleteSkippedResult(
            'the origin branch does not pass the automatic hosted remote-deletion safety checks.',
        );
    }

    return deleteHostedRemoteBranch(repoRoot, base, remoteBranch);
}

function deleteHostedRemoteBranch(
    repoRoot: string,
    base: BaseRef,
    remoteBranch: RemoteBranchAssessment,
): RemoteDeleteResult {
    const latestBaseValidation = readHostedRemoteDeleteBaseValidation(
        repoRoot,
        base,
    );

    if (latestBaseValidation.status === 'blocked') {
        return latestBaseValidation.result;
    }

    const validation = readHostedRemoteDeleteValidation(
        repoRoot,
        latestBaseValidation.base,
        remoteBranch,
    );

    return validation.status === 'blocked'
        ? validation.result
        : pushHostedRemoteBranchDelete(
              repoRoot,
              latestBaseValidation.base,
              remoteBranch,
              validation.liveSha,
          );
}

function readHostedRemoteDeleteBaseValidation(
    repoRoot: string,
    base: BaseRef,
): HostedRemoteDeleteBaseValidation {
    try {
        return {
            base: detectBaseRef(repoRoot, base.ref, base.remoteUrl, base),
            status: 'ready',
        };
    } catch (error) {
        return {
            result: buildRemoteDeleteSkippedResult(
                `origin could not be revalidated before hosted remote deletion: ${readUnknownErrorMessage(error)}`,
            ),
            status: 'blocked',
        };
    }
}

function readHostedRemoteDeleteValidation(
    repoRoot: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
): HostedRemoteDeleteValidation {
    const liveBranchState = readRemoteArchiveLiveBranchState(
        repoRoot,
        latestBase.shortName,
        remoteBranch,
    );

    if (liveBranchState.status !== 'ready') {
        return liveBranchState;
    }

    if (liveBranchState.liveSha !== remoteBranch.liveSha) {
        return {
            result: buildRemoteDeleteSkippedResult(
                `the live origin branch ${remoteBranch.shortName} moved from ${remoteBranch.liveSha?.slice(0, 7) ?? 'unknown'} to ${liveBranchState.liveSha.slice(0, 7)} before deletion.`,
            ),
            status: 'blocked',
        };
    }

    const latestLocalTrackingSha = readTrackedRemoteSha(
        repoRoot,
        remoteBranch.shortName,
    );
    const latestRemoteStatus = readOriginRemoteBranchStatus(
        repoRoot,
        latestBase,
        remoteBranch.branch,
        remoteBranch.shortName,
        liveBranchState.liveBranchProbe,
        latestLocalTrackingSha,
    );

    if (latestRemoteStatus !== 'safe') {
        return {
            result: buildRemoteDeleteSkippedResult(
                readRemoteDeleteSkippedReason(
                    latestBase.shortName,
                    remoteBranch.shortName,
                    latestRemoteStatus,
                ),
            ),
            status: 'blocked',
        };
    }

    return liveBranchState;
}

function pushHostedRemoteBranchDelete(
    repoRoot: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
): RemoteDeleteResult {
    const deleteResult = tryGit(repoRoot, [
        'push',
        'origin',
        `--force-with-lease=refs/heads/${remoteBranch.branch}:${liveSha}`,
        `:refs/heads/${remoteBranch.branch}`,
    ]);

    if (!deleteResult.ok) {
        return {
            backupRef: null,
            deleted: false,
            errors: [
                `remote branch ${remoteBranch.shortName}: ${deleteResult.error}`,
            ],
            skippedReason: null,
        };
    }

    const finalIssue = readHostedRemoteDeleteFinalIssue(
        repoRoot,
        latestBase,
        remoteBranch,
    );

    return finalIssue === null
        ? {
              archivedSha: liveSha,
              backupRef: null,
              backupRepoPath: null,
              deleted: true,
              errors: [],
              skippedReason: null,
          }
        : buildHostedRemoteDeleteFinalFailureResult(
              repoRoot,
              remoteBranch,
              liveSha,
              finalIssue,
          );
}

function buildHostedRemoteDeleteFinalFailureResult(
    repoRoot: string,
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
    finalIssue: string,
): RemoteDeleteResult {
    const liveBranchProbe = readLiveOriginBranchProbe(
        repoRoot,
        remoteBranch.branch,
    );

    return liveBranchProbe.kind === 'absent'
        ? restoreHostedRemoteBranchAfterIssue(
              repoRoot,
              remoteBranch,
              liveSha,
              finalIssue,
          )
        : buildHostedRemoteDeleteUnrestoredFailureResult(
              remoteBranch,
              liveSha,
              finalIssue,
              liveBranchProbe,
          );
}

function buildHostedRemoteDeleteUnrestoredFailureResult(
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
    finalIssue: string,
    liveBranchProbe: LiveOriginBranchProbe,
): RemoteDeleteResult {
    const branchState =
        liveBranchProbe.kind === 'present'
            ? `still exists at ${liveBranchProbe.sha.slice(0, 7)}`
            : 'could not be rechecked';

    return {
        archivedSha: liveSha,
        backupRef: null,
        backupRepoPath: null,
        deleted: false,
        errors: [
            `remote branch ${remoteBranch.shortName}: ${finalIssue}; the branch ${branchState}.`,
        ],
        skippedReason: null,
    };
}

function restoreHostedRemoteBranchAfterIssue(
    repoRoot: string,
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
    issue: string,
): RemoteDeleteResult {
    const restoreResult = tryGit(repoRoot, [
        'push',
        'origin',
        `--force-with-lease=refs/heads/${remoteBranch.branch}:`,
        `${liveSha}:refs/heads/${remoteBranch.branch}`,
    ]);
    const restored = restoreResult.ok
        ? hostedRemoteBranchRestored(repoRoot, remoteBranch, liveSha)
        : false;

    return {
        archivedSha: liveSha,
        backupRef: null,
        backupRepoPath: null,
        deleted: false,
        errors: restored
            ? []
            : [
                  `remote branch ${remoteBranch.shortName}: ${issue}; git-cleanup could not restore the branch${restoreResult.ok ? '' : `: ${restoreResult.error}`}.`,
              ],
        skippedReason: restored
            ? `${issue}, so the live origin branch was restored.`
            : `${issue}, and git-cleanup could not restore ${remoteBranch.shortName}.`,
    };
}

function hostedRemoteBranchRestored(
    repoRoot: string,
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
): boolean {
    const liveBranchProbe = readLiveOriginBranchProbe(
        repoRoot,
        remoteBranch.branch,
    );

    return (
        liveBranchProbe.kind === 'present' && liveBranchProbe.sha === liveSha
    );
}

function readHostedRemoteDeleteFinalIssue(
    repoRoot: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
): null | string {
    const headIssue = readRemoteArchiveHeadSkippedReason(repoRoot, latestBase);

    if (headIssue !== null) {
        return headIssue;
    }

    const liveBranchProbe = readLiveOriginBranchProbe(
        repoRoot,
        remoteBranch.branch,
    );

    if (liveBranchProbe.kind === 'absent') {
        return null;
    }

    return liveBranchProbe.kind === 'present'
        ? `the live origin branch ${remoteBranch.shortName} still exists after delete.`
        : readRemoteDeleteSkippedReason(
              latestBase.shortName,
              remoteBranch.shortName,
              'live_probe_unverified',
          );
}

function readLocalArchiveRemoteDeleteIssue(
    repoRoot: string,
    branchName: string,
    localBranch: LocalDeleteResult,
): null | string {
    if (!localBranch.deleted) {
        return 'the local branch was not deleted, so remote deletion was skipped.';
    }

    if (branchRefExists(repoRoot, branchName)) {
        return 'the local branch name was recreated after the archive, so remote deletion was skipped.';
    }

    if (localBranch.errors.length > 0) {
        return 'the local branch archive recorded errors, so remote deletion was skipped.';
    }

    if (
        localBranch.backupRef === null ||
        localBranch.archivedSha === null ||
        localBranch.backupReflogPrefix === undefined ||
        localBranch.backupReflogPrefix === null
    ) {
        return 'the local branch archive was not fully recorded, so remote deletion was skipped.';
    }

    const validatedLocalBackupRef = readValidatedBranchBackupRef(
        repoRoot,
        localBranch.backupRef,
        localBranch.archivedSha,
        localBranch.backupReflogPrefix,
    );

    return validatedLocalBackupRef === null
        ? 'the local branch archive ref could not be revalidated, so remote deletion was skipped.'
        : null;
}

function buildRemoteDeleteSkippedResult(
    skippedReason: string,
    backupRef: null | string = null,
    safeWithoutDelete = false,
): RemoteDeleteResult {
    return {
        backupRef,
        deleted: false,
        errors: [],
        safeWithoutDelete,
        skippedReason,
    };
}

function prepareRemoteArchive(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
    localBranchDeleted: boolean,
):
    | {
          latestBase: BaseRef;
          liveSha: string;
          remoteBranch: RemoteBranchAssessment;
          remoteRepoPath: string;
          status: 'ready';
      }
    | {
          result: RemoteDeleteResult;
          status: 'blocked';
      } {
    if (!localBranchDeleted) {
        return {
            result: buildRemoteDeleteSkippedResult(
                'the local branch was not deleted, so remote deletion was skipped.',
            ),
            status: 'blocked',
        };
    }

    if (branch.remoteBranch?.status === 'absent') {
        return prepareAbsentRemoteArchive(repoRoot, base, branch.remoteBranch);
    }

    const remoteArchiveCandidate = readRemoteArchiveCandidate(
        repoRoot,
        base,
        branch,
    );

    if (remoteArchiveCandidate.status !== 'ready') {
        return remoteArchiveCandidate;
    }

    const {
        latestBase,
        liveBranchProbe,
        liveSha,
        remoteBranch,
        remoteRepoPath,
    } = remoteArchiveCandidate;

    const proofValidation = readPresentRemoteArchiveProofValidation(
        repoRoot,
        latestBase,
        liveBranchProbe,
        remoteBranch,
    );

    return proofValidation.status === 'blocked'
        ? proofValidation
        : {
              latestBase,
              liveSha,
              remoteBranch,
              remoteRepoPath,
              status: 'ready',
          };
}

function readPresentRemoteArchiveProofValidation(
    repoRoot: string,
    latestBase: BaseRef,
    liveBranchProbe: Extract<LiveOriginBranchProbe, { kind: 'present' }>,
    remoteBranch: RemoteBranchAssessment,
):
    | {
          result: RemoteDeleteResult;
          status: 'blocked';
      }
    | {
          status: 'ready';
      } {
    const latestLocalTrackingSha = readTrackedRemoteSha(
        repoRoot,
        remoteBranch.shortName,
    );
    const latestRemoteStatus = readOriginRemoteBranchStatus(
        repoRoot,
        latestBase,
        remoteBranch.branch,
        remoteBranch.shortName,
        liveBranchProbe,
        latestLocalTrackingSha,
    );

    if (latestRemoteStatus !== 'safe') {
        return {
            result: buildRemoteDeleteSkippedResult(
                readRemoteDeleteSkippedReason(
                    latestBase.shortName,
                    remoteBranch.shortName,
                    latestRemoteStatus,
                ),
            ),
            status: 'blocked',
        };
    }

    if (
        !remoteSafetyProofStillMatches(
            repoRoot,
            latestBase,
            remoteBranch,
            latestLocalTrackingSha,
        )
    ) {
        return {
            result: buildRemoteDeleteSkippedResult(
                `the remote safety proof for ${remoteBranch.shortName} changed before remote archive, so remote deletion was skipped.`,
            ),
            status: 'blocked',
        };
    }

    return { status: 'ready' };
}

function remoteSafetyProofStillMatches(
    repoRoot: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    latestLocalTrackingSha: null | string,
): boolean {
    const latestRemoteSafetyProofFingerprint = readRemoteSafetyProofFingerprint(
        repoRoot,
        latestBase,
        remoteBranch.branch,
        remoteBranch.shortName,
        latestLocalTrackingSha,
    );

    return (
        remoteBranch.remoteSafetyProofFingerprint !== null &&
        latestRemoteSafetyProofFingerprint !== null &&
        latestRemoteSafetyProofFingerprint ===
            remoteBranch.remoteSafetyProofFingerprint
    );
}

function readRemoteArchiveLocalTrackingProofIssue(
    repoRoot: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
): null | string {
    if (remoteBranch.localTrackingSha === null) {
        return remoteBranch.localTrackingProofFingerprint === null
            ? null
            : `the local tracking ref proof for ${remoteBranch.shortName} disappeared`;
    }

    if (remoteBranch.localTrackingProofFingerprint === null) {
        return `the local tracking ref proof for ${remoteBranch.shortName} was not recorded`;
    }

    const latestLocalTrackingSha = readTrackedRemoteSha(
        repoRoot,
        remoteBranch.shortName,
    );

    if (latestLocalTrackingSha !== remoteBranch.localTrackingSha) {
        return `the local tracking ref for ${remoteBranch.shortName} changed`;
    }

    const latestTrackingProof = readLocalTrackingRefProof(
        repoRoot,
        latestBase,
        remoteBranch.shortName,
        remoteBranch.localTrackingSha,
    );

    if (
        latestTrackingProof.status !== 'safe' ||
        latestTrackingProof.fingerprint === null
    ) {
        return `the local tracking ref proof for ${remoteBranch.shortName} is no longer safe`;
    }

    return latestTrackingProof.fingerprint ===
        remoteBranch.localTrackingProofFingerprint
        ? null
        : `the local tracking ref proof for ${remoteBranch.shortName} changed`;
}

function prepareAbsentRemoteArchive(
    repoRoot: string,
    base: BaseRef,
    remoteBranch: RemoteBranchAssessment,
):
    | {
          latestBase: BaseRef;
          liveSha: string;
          remoteBranch: RemoteBranchAssessment;
          remoteRepoPath: string;
          status: 'ready';
      }
    | {
          result: RemoteDeleteResult;
          status: 'blocked';
      } {
    const latestBase = detectBaseRef(repoRoot, base.ref, base.remoteUrl, base);
    const remoteRepoPath = resolveLocalGitRemotePath(
        repoRoot,
        latestBase.remoteUrl,
    );

    if (remoteRepoPath === null) {
        return {
            result: buildRemoteDeleteSkippedResult(
                `the absent origin branch ${remoteBranch.shortName} could not be revalidated because the origin git directory is not locally accessible.`,
            ),
            status: 'blocked',
        };
    }

    const liveBranchProbe = readLiveOriginBranchProbe(
        repoRoot,
        remoteBranch.branch,
    );
    const latestLocalTrackingSha = readTrackedRemoteSha(
        repoRoot,
        remoteBranch.shortName,
    );
    const latestRemoteStatus = readOriginRemoteBranchStatus(
        repoRoot,
        latestBase,
        remoteBranch.branch,
        remoteBranch.shortName,
        liveBranchProbe,
        latestLocalTrackingSha,
    );

    if (latestRemoteStatus === 'absent') {
        const proofIssue = readAbsentRemoteProofChangeIssue(
            repoRoot,
            latestBase,
            remoteBranch,
            latestLocalTrackingSha,
        );

        if (proofIssue !== null) {
            return {
                result: buildRemoteDeleteSkippedResult(
                    `${proofIssue} before remote cleanup, so remote deletion was skipped.`,
                ),
                status: 'blocked',
            };
        }

        return {
            result: buildRemoteDeleteSkippedResult(
                `the live origin branch ${remoteBranch.shortName} is already absent and its remote history was revalidated as safe; no remote archive was needed.`,
                null,
                true,
            ),
            status: 'blocked',
        };
    }

    if (latestRemoteStatus === 'safe') {
        return {
            result: buildRemoteDeleteSkippedResult(
                `the live origin branch ${remoteBranch.shortName} reappeared before remote cleanup, so remote deletion was skipped.`,
            ),
            status: 'blocked',
        };
    }

    return {
        result: buildRemoteDeleteSkippedResult(
            readRemoteDeleteSkippedReason(
                latestBase.shortName,
                remoteBranch.shortName,
                latestRemoteStatus,
            ),
        ),
        status: 'blocked',
    };
}

function readRemoteArchiveCandidate(
    repoRoot: string,
    base: BaseRef,
    branch: BranchReport,
):
    | {
          latestBase: BaseRef;
          liveBranchProbe: Extract<LiveOriginBranchProbe, { kind: 'present' }>;
          liveSha: string;
          remoteBranch: RemoteBranchAssessment;
          remoteRepoPath: string;
          status: 'ready';
      }
    | {
          result: RemoteDeleteResult;
          status: 'blocked';
      } {
    const remoteBranch = branch.remoteBranch;

    if (
        remoteBranch === null ||
        !isRemoteBranchSafeToDelete(branch.name, remoteBranch)
    ) {
        return {
            result: buildRemoteDeleteSkippedResult(
                'the origin branch does not pass the automatic remote-deletion safety checks.',
            ),
            status: 'blocked',
        };
    }

    const latestBase = detectBaseRef(repoRoot, base.ref, base.remoteUrl, base);
    const remoteRepoPath = resolveLocalGitRemotePath(
        repoRoot,
        latestBase.remoteUrl,
    );

    if (remoteRepoPath === null) {
        return {
            result: buildRemoteDeleteSkippedResult(
                `the live origin branch ${remoteBranch.shortName} cannot be auto-archived because the origin git directory is not locally accessible.`,
            ),
            status: 'blocked',
        };
    }

    const liveBranchState = readRemoteArchiveLiveBranchState(
        repoRoot,
        latestBase.shortName,
        remoteBranch,
    );

    if (liveBranchState.status !== 'ready') {
        return liveBranchState;
    }

    return liveBranchState.liveSha !== remoteBranch.liveSha
        ? {
              result: buildRemoteDeleteSkippedResult(
                  `the live origin branch ${remoteBranch.shortName} moved from ${remoteBranch.liveSha?.slice(0, 7) ?? 'unknown'} to ${liveBranchState.liveSha.slice(0, 7)} before deletion.`,
              ),
              status: 'blocked',
          }
        : {
              latestBase,
              liveBranchProbe: liveBranchState.liveBranchProbe,
              liveSha: liveBranchState.liveSha,
              remoteBranch,
              remoteRepoPath,
              status: 'ready',
          };
}

function readRemoteArchiveLiveBranchState(
    repoRoot: string,
    baseShort: string,
    remoteBranch: RemoteBranchAssessment,
):
    | {
          liveBranchProbe: Extract<LiveOriginBranchProbe, { kind: 'present' }>;
          liveSha: string;
          status: 'ready';
      }
    | {
          result: RemoteDeleteResult;
          status: 'blocked';
      } {
    const liveBranchProbe = readLiveOriginBranchProbe(
        repoRoot,
        remoteBranch.branch,
    );

    if (liveBranchProbe.kind === 'present') {
        return {
            liveBranchProbe,
            liveSha: liveBranchProbe.sha,
            status: 'ready',
        };
    }

    return {
        result: buildRemoteDeleteSkippedResult(
            liveBranchProbe.kind === 'absent'
                ? `the live origin branch ${remoteBranch.shortName} no longer exists.`
                : readRemoteDeleteSkippedReason(
                      baseShort,
                      remoteBranch.shortName,
                      'live_probe_unverified',
                  ),
        ),
        status: 'blocked',
    };
}

function readRemoteDeleteSkippedReason(
    baseShort: string,
    remoteShortName: string,
    status: Exclude<RemoteBranchStatus, 'safe'>,
): string {
    const staticReasons: Partial<
        Record<Exclude<RemoteBranchStatus, 'safe'>, string>
    > = {
        absent: `the live origin branch ${remoteShortName} no longer exists; remote deletion was skipped.`,
        checked_out_in_origin_worktree: `the live origin branch ${remoteShortName} is currently checked out in the local origin repo, so remote deletion was skipped.`,
        history_not_on_base: `the live origin branch ${remoteShortName} still has remote-only history that is not reachable from ${baseShort}; remote deletion was skipped.`,
        history_unverified: `the live origin branch ${remoteShortName} could not be proved safe for remote deletion because its prior remote history is unverified.`,
        identity_unverified: `git-cleanup could not prove which live origin branch belongs to ${remoteShortName}; remote deletion was skipped.`,
        live_probe_unverified: `the live origin branch ${remoteShortName} could not be probed successfully, so remote deletion was skipped.`,
        live_tip_unverified: `the live origin branch ${remoteShortName} could not be verified against the local remote-tracking ref; remote deletion was skipped.`,
        non_origin_upstream: `the branch tracks ${remoteShortName}, but only origin branches are eligible for automatic remote deletion.`,
        protected_base: `the live origin branch ${remoteShortName} is the canonical default branch and is protected from deletion.`,
        tracking_ref_not_on_base: `the remaining local origin-tracking ref for ${remoteShortName} is still not reachable from ${baseShort}, so remote deletion was skipped.`,
    };

    return status === 'live_tip_not_on_base'
        ? `the live origin branch ${remoteShortName} is no longer reachable from ${baseShort}; remote deletion was skipped.`
        : (staticReasons[status] ?? '');
}

function archiveRemoteBranch(
    repoRoot: string,
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
): RemoteDeleteResult {
    assertNoHistoryRewriteOverlays(remoteRepoPath);

    return archiveRemoteBranchWithPinnedBase(
        repoRoot,
        remoteRepoPath,
        latestBase,
        remoteBranch,
        liveSha,
    );
}

function archiveRemoteBranchWithPinnedBase(
    repoRoot: string,
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
): RemoteDeleteResult {
    const latestLocalTrackingSha = readTrackedRemoteSha(
        repoRoot,
        remoteBranch.shortName,
    );

    if (
        !remoteSafetyProofStillMatches(
            repoRoot,
            latestBase,
            remoteBranch,
            latestLocalTrackingSha,
        )
    ) {
        return buildRemoteDeleteSkippedResult(
            `the remote safety proof for ${remoteBranch.shortName} changed immediately before remote archive, so remote deletion was skipped.`,
        );
    }

    const preArchiveSkippedReason = readRemoteArchiveSkippedReason(
        repoRoot,
        latestBase,
        remoteRepoPath,
        remoteBranch.branch,
        remoteBranch.shortName,
        liveSha,
    );

    if (preArchiveSkippedReason !== null) {
        return buildRemoteDeleteSkippedResult(preArchiveSkippedReason);
    }

    return archiveRemoteBranchAfterPreflight(
        repoRoot,
        remoteRepoPath,
        latestBase,
        remoteBranch,
        liveSha,
    );
}

function archiveRemoteBranchAfterPreflight(
    repoRoot: string,
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    liveSha: string,
): RemoteDeleteResult {
    const archiveRef = buildArchiveBranchRef(
        'remote',
        remoteBranch.branch,
        liveSha,
    );
    const archiveBranchName = archiveRef.replace(/^refs\/heads\//u, '');
    const expectedSourceReflog = readArchivedBranchReflog(
        remoteRepoPath,
        remoteBranch.branch,
    );

    if (
        expectedSourceReflog === null ||
        expectedSourceReflog.shas.length === 0
    ) {
        return buildFailedRemoteArchiveResult(
            remoteBranch,
            'source branch reflog could not be pinned before archive rename.',
        );
    }

    const archiveResult = archiveBranchRefTransaction(
        remoteRepoPath,
        remoteBranch.branch,
        archiveBranchName,
        liveSha,
        [
            {
                ref: 'HEAD',
                sha: latestBase.liveSha,
                target: `refs/heads/${latestBase.branchName}`,
            },
        ],
        expectedSourceReflog.content,
    );

    if (!archiveResult.ok) {
        return buildFailedRemoteArchiveResult(
            remoteBranch,
            archiveResult.error,
        );
    }

    const postArchiveIssue = readRemotePostArchiveIssue(
        repoRoot,
        remoteRepoPath,
        latestBase,
        remoteBranch,
        archiveBranchName,
    );

    if (postArchiveIssue !== null) {
        return restoreRemoteArchiveAfterIssue(
            remoteRepoPath,
            remoteBranch.branch,
            archiveBranchName,
            archiveRef,
            liveSha,
            expectedSourceReflog.content,
            postArchiveIssue,
            remoteBranch.shortName,
        );
    }

    return buildArchivedRemoteBranchResult(
        repoRoot,
        remoteRepoPath,
        latestBase,
        remoteBranch,
        archiveBranchName,
        archiveRef,
        liveSha,
        expectedSourceReflog.content,
    );
}

function readRemotePostArchiveIssue(
    repoRoot: string,
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    archiveBranchName: string,
): null | string {
    const postArchiveWorktreeIssue = readArchiveBranchWorktreeIssue(
        remoteRepoPath,
        remoteBranch.branch,
        archiveBranchName,
    );

    if (postArchiveWorktreeIssue !== null) {
        return `the remote archive rename for ${remoteBranch.shortName} was observed in an origin worktree (${postArchiveWorktreeIssue})`;
    }

    return readRemotePostArchiveSafetyIssue(
        repoRoot,
        remoteRepoPath,
        latestBase,
        remoteBranch,
    );
}

function readRemotePostArchiveSafetyIssue(
    repoRoot: string,
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
): null | string {
    const postArchiveSafetyIssue = readPostArchiveRemoteSafetyIssue(
        repoRoot,
        remoteRepoPath,
        latestBase,
    );

    if (postArchiveSafetyIssue !== null) {
        return `the remote safety proof changed after the archive rename (${postArchiveSafetyIssue})`;
    }

    const postArchiveTrackingIssue = readRemoteArchiveLocalTrackingProofIssue(
        repoRoot,
        latestBase,
        remoteBranch,
    );

    return postArchiveTrackingIssue === null
        ? null
        : `the remote safety proof changed after the archive rename (${postArchiveTrackingIssue})`;
}

function readRemoteArchiveSkippedReason(
    repoRoot: string,
    latestBase: BaseRef,
    remoteRepoPath: string,
    remoteBranchName: string,
    remoteShortName: string,
    liveSha: string,
): null | string {
    const headSkippedReason = readRemoteArchiveHeadSkippedReason(
        repoRoot,
        latestBase,
    );

    return (
        headSkippedReason ??
        readRemoteArchiveWorktreeSkippedReason(
            repoRoot,
            latestBase,
            remoteBranchName,
            remoteShortName,
        ) ??
        readRemoteArchivePreflightSkippedReason(
            remoteRepoPath,
            latestBase,
            remoteBranchName,
            remoteShortName,
            liveSha,
        )
    );
}

function readRemoteArchiveWorktreeSkippedReason(
    repoRoot: string,
    latestBase: BaseRef,
    remoteBranchName: string,
    remoteShortName: string,
): null | string {
    const worktreeStatus = readOriginCheckedOutWorktreeStatus(
        repoRoot,
        latestBase,
        remoteBranchName,
    );

    return worktreeStatus === 'safe'
        ? null
        : readRemoteDeleteSkippedReason(
              latestBase.shortName,
              remoteShortName,
              worktreeStatus,
          );
}

function buildFailedRemoteArchiveResult(
    remoteBranch: RemoteBranchAssessment,
    error: string,
): RemoteDeleteResult {
    return {
        backupRef: null,
        deleted: false,
        errors: [`remote branch ${remoteBranch.shortName}: ${error}`],
        skippedReason: null,
    };
}

function restoreRemoteArchiveAfterIssue(
    remoteRepoPath: string,
    originalBranchName: string,
    archiveBranchName: string,
    archiveRef: string,
    liveSha: string,
    expectedReflogPrefix: string,
    issue: string,
    restoreTargetLabel: string,
): RemoteDeleteResult {
    const restoreResult = restoreArchivedBranch(
        remoteRepoPath,
        originalBranchName,
        archiveBranchName,
        liveSha,
        expectedReflogPrefix,
    );
    const backupRef = readRestoreBackupRef(
        remoteRepoPath,
        restoreResult,
        archiveRef,
        liveSha,
        expectedReflogPrefix,
    );
    const preservedBackupValidationErrors = readPreservedBackupValidationErrors(
        'remote branch archive ref',
        restoreResult.preservedArchiveRef,
        backupRef,
        archiveRef,
    );

    return {
        archivedSha: backupRef === null ? null : liveSha,
        backupRef,
        backupReflogPrefix: backupRef === null ? null : expectedReflogPrefix,
        backupRepoPath: backupRef === null ? null : remoteRepoPath,
        deleted: false,
        errors: [...restoreResult.errors, ...preservedBackupValidationErrors],
        skippedReason: restoreResult.restored
            ? `${issue}, so the original remote branch name was restored.`
            : `${issue}, and git-cleanup could not restore ${restoreTargetLabel}.`,
    };
}

function readRestoreBackupRef(
    repoPath: string,
    restoreResult: ReturnType<typeof restoreArchivedBranch>,
    archiveRef: string,
    expectedBranchSha: string,
    expectedReflogPrefix: string,
): null | string {
    return restoreResult.preservedArchiveRef
        ? readValidatedBranchBackupRef(
              repoPath,
              archiveRef,
              expectedBranchSha,
              expectedReflogPrefix,
          )
        : null;
}

function readRemoteArchiveHeadSkippedReason(
    repoRoot: string,
    latestBase: BaseRef,
): null | string {
    try {
        const latestOriginUrl = readOriginUrl(repoRoot);
        const latestOriginHead = readOriginHead(repoRoot);

        if (latestOriginUrl !== latestBase.remoteUrl) {
            return `origin changed before remote archive, so remote deletion was skipped.`;
        }

        return latestOriginHead.branchName === latestBase.branchName &&
            latestOriginHead.liveSha === latestBase.liveSha
            ? null
            : `origin/HEAD changed before remote archive, so remote deletion was skipped.`;
    } catch (error) {
        return `origin/HEAD could not be revalidated before remote archive: ${readUnknownErrorMessage(error)}`;
    }
}

function readPostArchiveRemoteSafetyIssue(
    repoRoot: string,
    remoteRepoPath: string,
    base: BaseRef,
): null | string {
    try {
        const refreshedOriginUrl = readOriginUrl(repoRoot);
        const refreshedOriginHead = readOriginHead(repoRoot);

        if (refreshedOriginUrl !== base.remoteUrl) {
            return 'origin changed after the remote archive.';
        }

        if (
            refreshedOriginHead.branchName !== base.branchName ||
            refreshedOriginHead.liveSha !== base.liveSha
        ) {
            return 'origin/HEAD changed after the remote archive.';
        }

        return readRepositoryWideSafetyIssue(remoteRepoPath, base.liveSha);
    } catch (error) {
        return readUnknownErrorMessage(error);
    }
}

function readRemoteArchivePreflightSkippedReason(
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranchName: string,
    remoteShortName: string,
    liveSha: string,
): null | string {
    const latestRemoteBranchSha = readRefCommitSha(
        remoteRepoPath,
        `refs/heads/${remoteBranchName}`,
    );
    const latestBaseSha = readRefCommitSha(
        remoteRepoPath,
        `refs/heads/${latestBase.branchName}`,
    );

    if (latestRemoteBranchSha !== liveSha) {
        return `the live origin branch ${remoteShortName} changed before archive rename, so remote deletion was skipped.`;
    }

    if (latestBaseSha !== latestBase.liveSha) {
        return `origin/${latestBase.shortName} changed before archive rename, so remote deletion was skipped.`;
    }

    return gitSucceeded(remoteRepoPath, [
        'merge-base',
        '--is-ancestor',
        liveSha,
        latestBase.liveSha,
    ])
        ? null
        : `the live origin branch ${remoteShortName} is no longer reachable from ${latestBase.shortName}; remote deletion was skipped.`;
}

function buildArchivedRemoteBranchResult(
    repoRoot: string,
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    archiveBranchName: string,
    archiveRef: string,
    liveSha: string,
    expectedReflogPrefix: string,
): RemoteDeleteResult {
    const archiveValidation = readArchivedBranchValidation(
        remoteRepoPath,
        remoteBranch.branch,
        archiveBranchName,
        liveSha,
        expectedReflogPrefix,
    );

    if (!archiveValidation.archived) {
        const restoreResult = restoreArchivedBranch(
            remoteRepoPath,
            remoteBranch.branch,
            archiveBranchName,
            liveSha,
            expectedReflogPrefix,
        );
        const backupRef = readRestoreBackupRef(
            remoteRepoPath,
            restoreResult,
            archiveRef,
            liveSha,
            expectedReflogPrefix,
        );
        const preservedBackupValidationErrors =
            readPreservedBackupValidationErrors(
                'remote branch archive ref',
                restoreResult.preservedArchiveRef,
                backupRef,
                archiveRef,
            );

        return {
            archivedSha: backupRef === null ? null : liveSha,
            backupRef,
            backupReflogPrefix:
                backupRef === null ? null : expectedReflogPrefix,
            backupRepoPath: backupRef === null ? null : remoteRepoPath,
            deleted: false,
            errors: [
                ...archiveValidation.errors,
                ...restoreResult.errors,
                ...preservedBackupValidationErrors,
            ],
            skippedReason: restoreResult.restored
                ? `the remote archive rename for ${remoteBranch.shortName} did not validate, so the original branch name was restored.`
                : `the remote archive rename for ${remoteBranch.shortName} did not validate, and git-cleanup could not restore the original branch name.`,
        };
    }

    const finalArchiveIssue = readFinalRemoteArchiveIssue(
        repoRoot,
        remoteRepoPath,
        latestBase,
        remoteBranch,
        archiveBranchName,
    );

    if (finalArchiveIssue !== null) {
        return restoreRemoteArchiveAfterIssue(
            remoteRepoPath,
            remoteBranch.branch,
            archiveBranchName,
            archiveRef,
            liveSha,
            expectedReflogPrefix,
            finalArchiveIssue,
            remoteBranch.shortName,
        );
    }

    return {
        archivedSha: liveSha,
        backupRef: archiveRef,
        backupReflogPrefix: expectedReflogPrefix,
        backupRepoPath: remoteRepoPath,
        deleted: true,
        errors: [],
        skippedReason: null,
    };
}

function readFinalRemoteArchiveIssue(
    repoRoot: string,
    remoteRepoPath: string,
    latestBase: BaseRef,
    remoteBranch: RemoteBranchAssessment,
    archiveBranchName: string,
): null | string {
    const finalSafetyIssue = readPostArchiveRemoteSafetyIssue(
        repoRoot,
        remoteRepoPath,
        latestBase,
    );

    if (finalSafetyIssue !== null) {
        return `the remote safety proof changed after archive validation (${finalSafetyIssue})`;
    }

    const finalTrackingIssue = readRemoteArchiveLocalTrackingProofIssue(
        repoRoot,
        latestBase,
        remoteBranch,
    );

    if (finalTrackingIssue !== null) {
        return `the remote safety proof changed after archive validation (${finalTrackingIssue})`;
    }

    const finalWorktreeIssue = readArchiveBranchWorktreeIssue(
        remoteRepoPath,
        remoteBranch.branch,
        archiveBranchName,
    );

    return finalWorktreeIssue === null
        ? null
        : `the remote archive rename was observed in an origin worktree after final validation (${finalWorktreeIssue})`;
}

function renderOutput(report: GitCleanupReport, json: boolean): string {
    return json ? JSON.stringify(report, null, 2) : renderReport(report);
}

function renderReport(report: GitCleanupReport): string {
    const safeDeleteSections = renderBranchSectionsWithApplyResults(
        report.branches.safeDelete,
        report.applyResults,
    );
    const needsReviewSections = renderBranchSectionsWithApplyResults(
        report.branches.needsReview,
        report.applyResults,
    );
    const skippedSections = report.branches.skipped.map((branch) =>
        renderSkippedBranchSection(branch),
    );
    const detachedSections = report.detachedWorktrees.map((worktree) =>
        renderDetachedWorktreeSection(worktree),
    );

    return [
        '# Git Cleanup Report',
        `- Repository: \`${report.repoRoot}\``,
        `- Base branch: \`${report.base.ref}\``,
        `- Base source: \`${report.base.source}\``,
        `- Base live SHA: \`${report.base.liveSha.slice(0, 12)}\``,
        `- Mode: \`${report.mode}\``,
        `- Generated at: \`${report.generatedAt}\``,
        `- Safe to delete branches: ${report.summary.safeDeleteBranches}`,
        `- Needs review branches: ${report.summary.needsReviewBranches}`,
        `- Skipped branches: ${report.summary.skippedBranches}`,
        `- Detached worktrees: ${report.summary.detachedWorktrees}`,
        ...renderArchivePruneSummary(report),
        ...renderReportSection('## Safe To Delete', safeDeleteSections),
        ...renderReportSection('## Needs Review', needsReviewSections),
        ...renderReportSection('## Skipped', skippedSections),
        ...renderReportSection('## Detached Worktrees', detachedSections),
        ...renderArchivePruneSection(report),
        ...renderActionSummarySection(report),
    ].join('\n');
}

function renderActionSummarySection(report: GitCleanupReport): string[] {
    return renderReportSection('## Action Summary', [
        renderActionSummary(report),
    ]);
}

function renderActionSummary(report: GitCleanupReport): string {
    return [
        ...renderApplyResultsActionSummary(report.applyResults),
        ...renderArchivePruneActionSummary(report.archivePruneResults),
        renderSafeDeleteActionSummary(report.branches.safeDelete),
        ...renderApplyCommandActionSummary(report.branches.safeDelete),
        renderNeedsReviewActionSummary(report.branches.needsReview),
        renderDetachedWorktreeActionSummary(report.detachedWorktrees),
    ].join('\n');
}

function renderApplyResultsActionSummary(
    applyResults: readonly ApplyResult[] | undefined,
): string[] {
    if (applyResults === undefined) {
        return [];
    }

    if (applyResults.length === 0) {
        return ['- Applied deletes: none.'];
    }

    return [
        `- Applied deletes: ${applyResults.map(renderApplyResultActionSummary).join('; ')}.`,
    ];
}

function renderApplyResultActionSummary(applyResult: ApplyResult): string {
    const localStatus = applyResult.localBranchDeleted
        ? 'local deleted'
        : 'local kept';
    const remoteStatus = applyResult.remoteBranchDeleted
        ? 'origin deleted'
        : 'origin kept';
    const errorStatus =
        applyResult.errors.length === 0
            ? ''
            : `, ${applyResult.errors.length} error(s)`;

    return `\`${applyResult.branch}\` (${localStatus}, ${remoteStatus}${errorStatus})`;
}

function renderArchivePruneActionSummary(
    archivePruneResults: readonly ArchivePruneResult[] | undefined,
): string[] {
    if (archivePruneResults === undefined) {
        return [];
    }

    const prunedCount = archivePruneResults.filter(
        (result) => result.pruned,
    ).length;
    const keptCount = archivePruneResults.length - prunedCount;

    return [`- Archive pruning: ${prunedCount} pruned, ${keptCount} kept.`];
}

function renderSafeDeleteActionSummary(
    safeDeleteBranches: readonly BranchReport[],
): string {
    return `- Delete candidates: ${renderBranchNameList(safeDeleteBranches)}.`;
}

function renderApplyCommandActionSummary(
    safeDeleteBranches: readonly BranchReport[],
): string[] {
    return safeDeleteBranches.length === 0
        ? []
        : ['- To delete them: `slop-refinery git-cleanup --apply`.'];
}

function renderNeedsReviewActionSummary(
    needsReviewBranches: readonly BranchReport[],
): string {
    return `- Manual review: ${renderBranchNameList(needsReviewBranches)}.`;
}

function renderBranchNameList(branches: readonly { name: string }[]): string {
    return branches.length === 0
        ? 'none'
        : branches.map((branch) => `\`${branch.name}\``).join(', ');
}

function renderDetachedWorktreeActionSummary(
    detachedWorktrees: readonly DetachedWorktreeReport[],
): string {
    const count = detachedWorktrees.length;

    return count === 0
        ? '- Detached worktrees: none.'
        : `- Detached worktrees needing review: ${count}.`;
}

function renderArchivePruneSummary(report: GitCleanupReport): string[] {
    const prunedArchiveCount =
        report.archivePruneResults?.filter((result) => result.pruned).length ??
        0;

    return report.archivePruneResults === undefined
        ? []
        : [`- Archive refs pruned: ${prunedArchiveCount}`];
}

function renderReportSection(
    title: string,
    sections: readonly string[],
): string[] {
    return ['', title, renderReportSectionBody(sections)];
}

function renderReportSectionBody(sections: readonly string[]): string {
    return sections.length === 0 ? 'None.' : sections.join('\n\n');
}

function renderArchivePruneSection(report: GitCleanupReport): string[] {
    const archivePruneSections = (report.archivePruneResults ?? []).map(
        (result) => renderArchivePruneResult(result),
    );

    return report.archivePruneResults === undefined
        ? []
        : renderReportSection('## Archive Pruning', archivePruneSections);
}

function renderBranchSectionsWithApplyResults(
    branches: readonly BranchReport[],
    applyResults: readonly ApplyResult[] | undefined,
): string[] {
    return branches.map((branch) =>
        renderBranchSection(
            branch,
            applyResults?.find((candidate) => candidate.branch === branch.name),
        ),
    );
}

function renderBranchSection(
    branch: BranchReport,
    applyResult?: ApplyResult,
): string {
    const lines = [
        `### \`${branch.name}\``,
        `- Classification: \`${branch.classification}\``,
        `- Reason codes: ${renderReasonCodes(branch.reasonCodes)}`,
        `- Opinion: \`${branch.opinion.code}\` because ${branch.opinion.reason}`,
        `- Activity: ${branch.activity}`,
        `- State: safeToDelete=${branch.state.safeToDelete}, branchTipOnBase=${branch.state.branchTipOnBase}, mergedByHistory=${branch.state.mergedByHistory}, uniqueCommitCount=${branch.state.uniqueCommitCount}, branchReflogAvailable=${branch.state.branchReflogAvailable}, branchReflogUniqueCommitCount=${branch.state.branchReflogUniqueCommitCount}, repositoryLinkedWorktrees=${branch.state.repositoryLinkedWorktreeCount}, repositoryUnreachableCommitsAvailable=${branch.state.repositoryUnreachableCommitsAvailable}, repositoryUnreachableCommitCount=${branch.state.repositoryUnreachableCommitCount}, originBranchStatus=${branch.state.originBranchStatus}, ahead=${branch.state.aheadCount}, behind=${branch.state.behindCount}, linkedWorktrees=${branch.state.linkedWorktreeCount}`,
        renderRemoteBranch(branch.remoteBranch),
    ];

    for (const detail of branch.reasonDetails) {
        lines.push(`- Detail: ${detail}`);
    }

    lines.push(...renderLinkedWorktrees(branch.linkedWorktrees));
    lines.push(...renderRecentCommits(branch.recentCommits));
    lines.push(...renderDeleteCommands(branch.deleteCommands));

    if (applyResult !== undefined) {
        lines.push(...renderApplyResult(applyResult));
    }

    return lines.join('\n');
}

function renderReasonCodes(reasonCodes: readonly string[]): string {
    if (reasonCodes.length === 0) {
        return 'none';
    }

    return reasonCodes.map((reasonCode) => `\`${reasonCode}\``).join(', ');
}

function renderRemoteBranch(
    remoteBranch: null | RemoteBranchAssessment,
): string {
    if (remoteBranch === null) {
        return '- Remote branch: none';
    }

    return `- Remote branch: \`${remoteBranch.shortName}\` (status=${remoteBranch.status}, liveSha=${remoteBranch.liveSha ?? 'none'}, localTrackingSha=${remoteBranch.localTrackingSha ?? 'none'})`;
}

function renderLinkedWorktrees(
    linkedWorktrees: readonly WorktreeInfo[],
): string[] {
    if (linkedWorktrees.length === 0) {
        return ['- Linked worktrees: none'];
    }

    const lines = ['- Linked worktrees:'];

    for (const worktree of linkedWorktrees) {
        const role = worktree.isPrimary ? 'primary' : 'linked';
        lines.push(
            `  - \`${worktree.path}\` (${role}, state=${worktree.state}, statusLines=${worktree.statusLines.length})`,
        );
    }

    return lines;
}

function renderRecentCommits(recentCommits: readonly CommitInfo[]): string[] {
    if (recentCommits.length === 0) {
        return ['- Recent commits: none'];
    }

    const lines = ['- Recent commits:'];

    for (const commit of recentCommits) {
        lines.push(
            `  - \`${commit.shortSha}\` ${commit.subject} (${commit.dateIso.slice(0, 10)} by ${commit.author})`,
        );
    }

    return lines;
}

function renderDeleteCommands(deleteCommands: readonly string[]): string[] {
    if (deleteCommands.length === 0) {
        return ['- Delete commands: none'];
    }

    const lines = ['- Delete commands:'];

    for (const command of deleteCommands) {
        lines.push(`  - \`${command}\``);
    }

    return lines;
}

function renderApplyResult(applyResult: ApplyResult): string[] {
    const removedWorktreeLines =
        applyResult.removedWorktrees.length === 0
            ? ['  - Removed worktrees: none']
            : [
                  '  - Removed worktrees:',
                  ...applyResult.removedWorktrees.map(
                      (worktree) => `    - \`${worktree}\``,
                  ),
              ];
    const worktreeBackupLines =
        applyResult.worktreeBackupPaths.length === 0
            ? ['  - Worktree backups: none']
            : [
                  '  - Worktree backups:',
                  ...applyResult.worktreeBackupPaths.map(
                      (worktree) => `    - \`${worktree}\``,
                  ),
              ];
    const errorLines =
        applyResult.errors.length === 0
            ? ['  - Errors: none']
            : [
                  '  - Errors:',
                  ...applyResult.errors.map((error) => `    - ${error}`),
              ];

    return [
        `- Apply result for \`${applyResult.branch}\`:`,
        ...removedWorktreeLines,
        ...worktreeBackupLines,
        `  - Local backup ref: ${applyResult.localBackupRef === null ? 'none' : `\`${applyResult.localBackupRef}\``}`,
        `  - Local branch deleted: ${applyResult.localBranchDeleted}`,
        ...(applyResult.localBranchSkippedReason === null
            ? []
            : [
                  `  - Local branch skipped because ${applyResult.localBranchSkippedReason}`,
              ]),
        `  - Remote backup ref: ${applyResult.remoteBackupRef === null ? 'none' : `\`${applyResult.remoteBackupRef}\``}`,
        `  - Remote branch deleted: ${applyResult.remoteBranchDeleted}`,
        ...(applyResult.remoteBranchSkippedReason === null
            ? []
            : [
                  `  - Remote branch skipped because ${applyResult.remoteBranchSkippedReason}`,
              ]),
        ...errorLines,
    ];
}

function renderArchivePruneResult(result: ArchivePruneResult): string {
    return [
        `### \`${result.ref}\``,
        `- Repository: \`${result.repoPath}\``,
        `- Scope: \`${result.scope}\``,
        `- Archived SHA: ${result.archivedSha === null ? 'none' : `\`${result.archivedSha.slice(0, 12)}\``}`,
        `- Pruned: ${result.pruned}`,
        ...(result.skippedReason === null
            ? []
            : [`- Skipped because ${result.skippedReason}`]),
        ...renderArchivePruneErrors(result.errors),
    ].join('\n');
}

function renderArchivePruneErrors(errors: readonly string[]): string[] {
    if (errors.length === 0) {
        return ['- Errors: none'];
    }

    return ['- Errors:', ...errors.map((error) => `  - ${error}`)];
}

function renderSkippedBranchSection(branch: SkippedBranchReport): string {
    return [
        `### \`${branch.name}\``,
        `- Classification: \`${branch.classification}\``,
        `- Ref: \`${branch.ref}\``,
        `- Reason codes: ${renderReasonCodes(branch.reasonCodes)}`,
        ...branch.reasonDetails.map((detail) => `- Detail: ${detail}`),
    ].join('\n');
}

function renderDetachedWorktreeSection(
    worktree: DetachedWorktreeReport,
): string {
    return [
        `### \`${worktree.path}\``,
        `- Classification: \`${worktree.classification}\``,
        `- Reason codes: ${renderReasonCodes(worktree.reasonCodes)}`,
        `- Opinion: \`${worktree.opinion.code}\` because ${worktree.opinion.reason}`,
        `- Head commit: \`${worktree.headCommit.shortSha}\` ${worktree.headCommit.subject} (${worktree.headCommit.dateIso.slice(0, 10)} by ${worktree.headCommit.author})`,
        `- State: status=${worktree.state.status}, headOnBase=${worktree.state.headOnBase}, headReflogAvailable=${worktree.state.headReflogAvailable}, headReflogUniqueCommitCount=${worktree.state.headReflogUniqueCommitCount}, repositoryWorktreeDirtyCount=${worktree.state.repositoryWorktreeDirtyCount}, repositoryUnreachableCommitsAvailable=${worktree.state.repositoryUnreachableCommitsAvailable}, repositoryUnreachableCommitCount=${worktree.state.repositoryUnreachableCommitCount}, safeToRemoveManually=${worktree.state.safeToRemoveManually}, statusLines=${worktree.state.statusLineCount}`,
        ...worktree.reasonDetails.map((detail) => `- Detail: ${detail}`),
        ...renderStatusLines(worktree.statusLines),
    ].join('\n');
}

function renderStatusLines(statusLines: readonly string[]): string[] {
    if (statusLines.length === 0) {
        return ['- Status lines: none'];
    }

    const lines = ['- Status lines:'];

    for (const statusLine of statusLines) {
        lines.push(`  - \`${statusLine}\``);
    }

    return lines;
}
