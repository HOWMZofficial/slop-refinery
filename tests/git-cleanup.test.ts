import { execFileSync, spawnSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type {
    GitCleanupBranchReport,
    GitCleanupReportType,
} from '../src/lib/index.ts';

import {
    archiveBranchRefTransactionForTesting,
    readReachableHiddenRefsForTesting,
    restoreArchivedBranchForTesting,
    validateArchivedBranchForTesting,
} from '../src/lib/git-cleanup.ts';

type GitFixture = {
    originPath: string;
    repoPath: string;
    tempPath: string;
};

type FeatureArchiveRefs = {
    localArchiveRef: string;
    remoteArchiveRef: string;
};

type GitCleanupStressLocalMode =
    | 'clean'
    | 'detached'
    | 'hidden_ref'
    | 'tag_reflog';
type GitCleanupStressRemoteMode =
    | 'absent_no_upstream'
    | 'clean'
    | 'hidden_ref'
    | 'live_drift'
    | 'stale_tracking'
    | 'tag_reflog';
type GitCleanupStressScenario = {
    localMode: GitCleanupStressLocalMode;
    remoteMode: GitCleanupStressRemoteMode;
    seed: number;
};

const repoPath = process.cwd();
const tsxCommandPath = path.join(
    repoPath,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
);
const gitCleanupCliPath = path.join(repoPath, 'src', 'cli', 'bin.ts');
const temporaryPaths: string[] = [];

function git(
    cwd: string,
    args: readonly string[],
    captureOutput = true,
): string {
    const result = execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: captureOutput ? 'pipe' : 'inherit',
    });

    return typeof result === 'string' ? result.trim() : '';
}

function configureGitIdentity(cwd: string): void {
    git(cwd, ['config', 'user.email', 'slop-refinery@example.com']);
    git(cwd, ['config', 'user.name', 'Slop Refinery Tests']);
}

function writeFile(filePath: string, content: string): void {
    writeFileSync(filePath, content);
}

function createGitFixture(): GitFixture {
    const tempPath = mkdtempSync(
        path.join(os.tmpdir(), 'slop-refinery-git-cleanup-'),
    );
    const originPath = path.join(tempPath, 'origin.git');
    const seedPath = path.join(tempPath, 'seed');
    const repoClonePath = path.join(tempPath, 'repo');

    temporaryPaths.push(tempPath);

    initializeOriginRepository(tempPath, originPath, seedPath);
    cloneFixtureRepository(tempPath, originPath, repoClonePath);

    return {
        originPath,
        repoPath: repoClonePath,
        tempPath,
    };
}

function createNonBareOriginFixture(): GitFixture {
    const tempPath = mkdtempSync(
        path.join(os.tmpdir(), 'slop-refinery-git-cleanup-non-bare-'),
    );
    const originPath = path.join(tempPath, 'origin');
    const repoClonePath = path.join(tempPath, 'repo');

    temporaryPaths.push(tempPath);

    initializeNonBareOriginRepository(tempPath, originPath);
    git(tempPath, ['clone', originPath, repoClonePath], false);
    configureFixtureClone(repoClonePath);

    return {
        originPath,
        repoPath: repoClonePath,
        tempPath,
    };
}

function initializeNonBareOriginRepository(
    tempPath: string,
    originPath: string,
): void {
    git(tempPath, ['init', originPath], false);
    configureGitIdentity(originPath);
    git(originPath, ['config', 'receive.denyCurrentBranch', 'updateInstead']);
    git(originPath, ['checkout', '-b', 'main'], false);
    writeFile(path.join(originPath, 'README.md'), '# fixture\n');
    git(originPath, ['add', 'README.md'], false);
    git(originPath, ['commit', '-m', 'Initial commit'], false);
    configureFixtureHistoryRetention(originPath);
}

function initializeOriginRepository(
    tempPath: string,
    originPath: string,
    seedPath: string,
): void {
    git(tempPath, ['init', '--bare', originPath], false);
    configureFixtureHistoryRetention(originPath);
    git(tempPath, ['init', seedPath], false);
    configureGitIdentity(seedPath);
    git(seedPath, ['checkout', '-b', 'main'], false);
    writeFile(path.join(seedPath, 'README.md'), '# fixture\n');
    git(seedPath, ['add', 'README.md'], false);
    git(seedPath, ['commit', '-m', 'Initial commit'], false);
    git(seedPath, ['remote', 'add', 'origin', originPath], false);
    git(seedPath, ['push', '-u', 'origin', 'main'], false);
    git(originPath, ['symbolic-ref', 'HEAD', 'refs/heads/main'], false);
}

function cloneFixtureRepository(
    tempPath: string,
    originPath: string,
    repoClonePath: string,
): void {
    git(tempPath, ['clone', originPath, repoClonePath], false);
    configureFixtureClone(repoClonePath);
}

function configureFixtureClone(repoClonePath: string): void {
    configureGitIdentity(repoClonePath);
    configureFixtureHistoryRetention(repoClonePath);
}

function makeOriginAppearHosted(fixture: GitFixture): string {
    const hostedOriginUrl = `ssh://git@example.test/${path.basename(
        fixture.tempPath,
    )}/origin.git`;

    git(fixture.repoPath, ['remote', 'set-url', 'origin', hostedOriginUrl]);
    git(
        fixture.repoPath,
        ['config', `url.${fixture.originPath}.insteadOf`, hostedOriginUrl],
        false,
    );

    return hostedOriginUrl;
}

function configureFixtureHistoryRetention(cwd: string): void {
    git(cwd, ['config', 'core.logAllRefUpdates', 'always'], false);
    git(cwd, ['config', 'gc.reflogExpire', 'never'], false);
    git(cwd, ['config', 'gc.reflogExpireUnreachable', 'never'], false);
}

function commitFile(
    cwd: string,
    relativePath: string,
    content: string,
    message: string,
): void {
    writeFile(path.join(cwd, relativePath), content);
    git(cwd, ['add', relativePath], false);
    git(cwd, ['commit', '-m', message], false);
}

function createUnreferencedCommit(cwd: string, message: string): string {
    const treeSha = git(cwd, ['rev-parse', 'main^{tree}']);

    return git(cwd, [
        '-c',
        'user.email=slop-refinery@example.com',
        '-c',
        'user.name=Slop Refinery Tests',
        'commit-tree',
        treeSha,
        '-p',
        'main',
        '-m',
        message,
    ]);
}

function createMergedFeatureBranch(
    cwd: string,
    branchName: string,
    options?: {
        pushAsBranch?: string;
        pushRemote?: boolean;
    },
): void {
    git(cwd, ['checkout', '-b', branchName], false);
    commitFile(
        cwd,
        `${branchName}.txt`,
        `${branchName}\n`,
        `Add ${branchName} work`,
    );

    if (options?.pushRemote === true) {
        git(
            cwd,
            [
                'push',
                '-u',
                'origin',
                options.pushAsBranch === undefined
                    ? branchName
                    : `${branchName}:${options.pushAsBranch}`,
            ],
            false,
        );
    }

    git(cwd, ['checkout', 'main'], false);
    git(cwd, ['merge', '--ff-only', branchName], false);
    git(cwd, ['push', 'origin', 'main'], false);
}

function createUnmergedRemoteBranch(cwd: string, branchName: string): void {
    git(cwd, ['checkout', '-b', branchName], false);
    commitFile(
        cwd,
        `${branchName}.txt`,
        `${branchName}\n`,
        `Add ${branchName} work`,
    );
    git(cwd, ['push', '-u', 'origin', branchName], false);
    git(cwd, ['checkout', 'main'], false);
}

function createHiddenLocalRefNotOnBase(cwd: string, refName: string): void {
    git(cwd, ['checkout', '-b', 'hidden-history'], false);
    commitFile(
        cwd,
        'hidden-history.txt',
        'hidden-history\n',
        'Create hidden-history work',
    );
    git(cwd, ['update-ref', refName, 'HEAD'], false);
    git(cwd, ['checkout', 'main'], false);
    git(cwd, ['branch', '-D', 'hidden-history'], false);
}

function createUnreachableBlob(cwd: string): string {
    const blobSourcePath = path.join(cwd, 'unreachable-blob-source.txt');

    writeFile(blobSourcePath, 'unreachable blob\n');
    const blobSha = git(cwd, ['hash-object', '-w', blobSourcePath]);
    rmSync(blobSourcePath, { force: true });

    return blobSha;
}

function createHiddenNonCommitRefNotOnBase(
    fixture: GitFixture,
    refName: string,
): void {
    const blobSourcePath = path.join(fixture.tempPath, 'non-commit-source.txt');
    writeFile(blobSourcePath, 'non-commit history\n');
    const blobSha = git(fixture.repoPath, [
        'hash-object',
        '-w',
        blobSourcePath,
    ]);
    git(fixture.repoPath, ['update-ref', refName, blobSha], false);
}

function createArchivedBranchRefNotOnBase(
    fixture: GitFixture,
    archivedBranchName: string,
): void {
    git(fixture.repoPath, ['checkout', '-b', 'archived-off-base'], false);
    commitFile(
        fixture.repoPath,
        'archived-off-base.txt',
        'archived-off-base\n',
        'Create archived off-base work',
    );
    git(
        fixture.repoPath,
        ['branch', '-m', 'archived-off-base', archivedBranchName],
        false,
    );
    removeRefReflog(
        fixture.repoPath,
        'refs',
        'heads',
        ...archivedBranchName.split('/'),
    );
    git(fixture.repoPath, ['checkout', 'main'], false);
}

function createMovedTagReflogHistoryNotOnBase(
    cwd: string,
    tagName: string,
): void {
    git(cwd, ['checkout', '-b', 'tag-history'], false);
    commitFile(
        cwd,
        'tag-history.txt',
        'tag-history\n',
        'Create tag-history work',
    );
    git(cwd, ['tag', '-f', tagName, 'HEAD'], false);
    git(cwd, ['checkout', 'main'], false);
    git(cwd, ['tag', '-f', tagName, 'main'], false);
    git(cwd, ['branch', '-D', 'tag-history'], false);
}

function readCurrentSha(cwd: string, ref: string): string {
    return git(cwd, ['rev-parse', ref]);
}

function unsetUpstreamAndDeleteTracking(cwd: string, branchName: string): void {
    git(cwd, ['branch', '--unset-upstream', branchName], false);
    git(cwd, ['update-ref', '-d', `refs/remotes/origin/${branchName}`], false);
}

function readGitCommonDir(cwd: string): string {
    return git(cwd, [
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
    ]);
}

function readAbsoluteGitDir(cwd: string): string {
    return git(cwd, ['rev-parse', '--absolute-git-dir']);
}

function createRealIndexOnlyReadmeChange(
    cwd: string,
    alternateIndexPath: string,
): void {
    git(
        cwd,
        ['read-tree', `--index-output=${alternateIndexPath}`, 'HEAD'],
        false,
    );
    writeFile(path.join(cwd, 'README.md'), '# staged-only\n');
    git(cwd, ['add', 'README.md'], false);
    writeFile(path.join(cwd, 'README.md'), '# fixture\n');
}

function createTrackedGitlinkWithoutGitmodules(cwd: string): void {
    const gitlinkPath = path.join(cwd, 'vendor', 'nested');

    mkdirSync(gitlinkPath, { recursive: true });
    git(gitlinkPath, ['init'], false);
    configureGitIdentity(gitlinkPath);
    git(gitlinkPath, ['checkout', '-b', 'main'], false);
    commitFile(
        gitlinkPath,
        'nested.txt',
        'nested\n',
        'Create nested gitlink work',
    );

    const gitlinkSha = readCurrentSha(gitlinkPath, 'main');

    git(
        cwd,
        [
            'update-index',
            '--add',
            '--cacheinfo',
            `160000,${gitlinkSha},vendor/nested`,
        ],
        false,
    );
    git(cwd, ['commit', '-m', 'Track nested gitlink'], false);
}

function createDetachedWorktreeWithLocalOnlyCommit(
    fixture: GitFixture,
    branchName: string,
    detachedWorktreePath: string,
): void {
    git(
        fixture.repoPath,
        ['worktree', 'add', detachedWorktreePath, branchName],
        false,
    );
    git(detachedWorktreePath, ['checkout', '--detach'], false);
    commitFile(
        detachedWorktreePath,
        'detached-only.txt',
        'detached\n',
        'Create detached-only work',
    );
}

function createDetachedOriginWorktreeWithLocalOnlyCommitAndNoReflog(
    fixture: GitFixture,
    detachedWorktreePath: string,
): void {
    git(
        fixture.originPath,
        ['worktree', 'add', '--detach', detachedWorktreePath, 'main'],
        false,
    );
    configureGitIdentity(detachedWorktreePath);
    commitFile(
        detachedWorktreePath,
        'origin-detached-only.txt',
        'origin-detached-only\n',
        'Create origin detached-only work',
    );
    rmSync(
        path.join(readAbsoluteGitDir(detachedWorktreePath), 'logs', 'HEAD'),
        {
            force: true,
        },
    );
}

function createAttachedLinkedWorktreeWithDetachedHeadHistory(
    fixture: GitFixture,
    branchName: string,
    linkedWorktreePath: string,
): void {
    git(fixture.repoPath, ['branch', branchName, 'main'], false);
    git(
        fixture.repoPath,
        ['worktree', 'add', linkedWorktreePath, branchName],
        false,
    );
    git(linkedWorktreePath, ['checkout', '--detach'], false);
    commitFile(
        linkedWorktreePath,
        'attached-detached-only.txt',
        'attached-detached-only\n',
        'Create linked-worktree detached-only history',
    );
    git(linkedWorktreePath, ['checkout', branchName], false);
}

function removeRefReflog(cwd: string, ...refSegments: string[]): void {
    rmSync(path.join(readGitCommonDir(cwd), 'logs', ...refSegments), {
        force: true,
        recursive: true,
    });
}

function runGitCleanup(
    cwd: string,
    args: readonly string[],
    env?: NodeJS.ProcessEnv,
): {
    output: string;
    status: number;
} {
    const result = spawnSync(tsxCommandPath, [gitCleanupCliPath, ...args], {
        cwd,
        encoding: 'utf8',
        env: env === undefined ? process.env : { ...process.env, ...env },
        stdio: 'pipe',
    });

    return {
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
        status: result.status ?? 1,
    };
}

function runGitCleanupJson(
    cwd: string,
    args: readonly string[],
    env?: NodeJS.ProcessEnv,
): GitCleanupReportType {
    const result = runGitCleanup(cwd, [...args, '--json'], env);

    if (result.status !== 0) {
        throw new Error(
            `Expected git-cleanup to succeed, but it failed: ${result.output}`,
        );
    }

    return parseGitCleanupReport(result.output);
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isGitCleanupReport(value: unknown): value is GitCleanupReportType {
    return (
        isNonNullObject(value) &&
        'branches' in value &&
        'summary' in value &&
        'detachedWorktrees' in value &&
        'base' in value
    );
}

function parseGitCleanupReport(output: string): GitCleanupReportType {
    const parsedOutput: unknown = JSON.parse(output);

    if (!isGitCleanupReport(parsedOutput)) {
        throw new Error('Expected git-cleanup JSON output to be a report.');
    }

    return parsedOutput;
}

function findBranchReport(
    report: GitCleanupReportType,
    bucket: 'needsReview' | 'safeDelete',
    branchName: string,
): GitCleanupBranchReport | undefined {
    return report.branches[bucket].find((branch) => branch.name === branchName);
}

function findApplyResult(
    report: GitCleanupReportType,
    branchName: string,
): NonNullable<GitCleanupReportType['applyResults']>[number] | undefined {
    return report.applyResults?.find((result) => result.branch === branchName);
}

function findArchivePruneResult(
    report: GitCleanupReportType,
    repoPath: string,
    ref: string,
):
    | NonNullable<GitCleanupReportType['archivePruneResults']>[number]
    | undefined {
    return report.archivePruneResults?.find(
        (result) =>
            realpathSync(result.repoPath) === realpathSync(repoPath) &&
            result.ref === ref,
    );
}

function findArchivedBranch(
    cwd: string,
    scope: 'local' | 'remote',
    branchName: string,
): null | string {
    const output = git(cwd, [
        'for-each-ref',
        `refs/heads/slop-refinery/archive/${scope}/${branchName}`,
        '--format=%(refname:short)',
    ]);

    if (output === '') {
        return null;
    }

    return (
        output
            .split('\n')
            .find((refName) =>
                refName.startsWith(
                    `slop-refinery/archive/${scope}/${branchName}/`,
                ),
            ) ?? null
    );
}

function expectArchivedBranchReflogExists(
    cwd: string,
    archivedBranchName: string,
): void {
    expect(
        existsSync(
            path.join(
                readGitCommonDir(cwd),
                'logs',
                'refs',
                'heads',
                archivedBranchName,
            ),
        ),
    ).toBe(true);
}

function ensurePresent<T>(value: null | T, message: string): T {
    if (value !== null) {
        return value;
    }

    throw new Error(message);
}

function expectRemoteArchiveTransactionFailedWithoutArchive(
    fixture: GitFixture,
    archiveResult: ReturnType<typeof archiveBranchRefTransactionForTesting>,
    featureSha: string,
    archiveBranchName: string,
): void {
    expect(archiveResult.ok).toBe(false);
    expect(readCurrentSha(fixture.originPath, 'feature')).toBe(featureSha);
    expect(
        git(fixture.originPath, [
            'for-each-ref',
            `refs/heads/${archiveBranchName}`,
            '--format=%(refname:short)',
        ]),
    ).toBe('');
}

function expectFeatureDeletedLocallyAndRemotely(
    fixture: GitFixture,
    applyResult:
        | NonNullable<GitCleanupReportType['applyResults']>[number]
        | undefined,
    remoteFeatureSha: string,
): void {
    const localArchiveBranch = ensurePresent(
        findArchivedBranch(fixture.repoPath, 'local', 'feature'),
        'Expected a local archived branch for feature.',
    );
    const remoteArchiveBranch = ensurePresent(
        findArchivedBranch(fixture.originPath, 'remote', 'feature'),
        'Expected a remote archived branch for feature.',
    );

    expect(applyResult?.localBranchDeleted).toBe(true);
    expect(applyResult?.remoteBranchDeleted).toBe(true);
    expect(applyResult?.remoteBranchSkippedReason).toBeNull();
    expect(git(fixture.repoPath, ['branch', '--list', 'feature'])).toBe('');
    expect(
        git(fixture.repoPath, ['ls-remote', 'origin', 'refs/heads/feature']),
    ).toBe('');
    expect(readCurrentSha(fixture.repoPath, localArchiveBranch)).toBe(
        remoteFeatureSha,
    );
    expect(readCurrentSha(fixture.originPath, remoteArchiveBranch)).toBe(
        remoteFeatureSha,
    );
    expectArchivedBranchReflogExists(fixture.repoPath, localArchiveBranch);
    expectArchivedBranchReflogExists(fixture.originPath, remoteArchiveBranch);
    expect(applyResult?.remoteBackupRef).toBe(
        `refs/heads/${remoteArchiveBranch}`,
    );
}

function expectHostedFeatureDeletedLocallyAndRemotely(
    fixture: GitFixture,
    applyResult:
        | NonNullable<GitCleanupReportType['applyResults']>[number]
        | undefined,
    remoteFeatureSha: string,
): void {
    const localArchiveBranch = ensurePresent(
        findArchivedBranch(fixture.repoPath, 'local', 'feature'),
        'Expected a local archived branch for feature.',
    );

    expect(applyResult?.localBranchDeleted).toBe(true);
    expect(applyResult?.remoteBranchDeleted).toBe(true);
    expect(applyResult?.remoteBranchSkippedReason).toBeNull();
    expect(applyResult?.remoteBackupRef).toBeNull();
    expect(git(fixture.repoPath, ['branch', '--list', 'feature'])).toBe('');
    expect(
        git(fixture.repoPath, ['ls-remote', 'origin', 'refs/heads/feature']),
    ).toBe('');
    expect(readCurrentSha(fixture.repoPath, localArchiveBranch)).toBe(
        remoteFeatureSha,
    );
    expect(
        findArchivedBranch(fixture.originPath, 'remote', 'feature'),
    ).toBeNull();
    expectArchivedBranchReflogExists(fixture.repoPath, localArchiveBranch);
}

function expectHostedAbsentFeatureDeletedLocally(
    fixture: GitFixture,
    applyResult:
        | NonNullable<GitCleanupReportType['applyResults']>[number]
        | undefined,
    localFeatureSha: string,
): void {
    const localArchiveBranch = ensurePresent(
        findArchivedBranch(fixture.repoPath, 'local', 'feature'),
        'Expected a local archived branch for feature.',
    );

    expect(applyResult?.localBranchDeleted).toBe(true);
    expect(applyResult?.remoteBranchDeleted).toBe(false);
    expect(applyResult?.errors).toEqual([]);
    expect(applyResult?.remoteBranchSkippedReason).toContain('already absent');
    expect(git(fixture.repoPath, ['branch', '--list', 'feature'])).toBe('');
    expect(
        git(fixture.repoPath, ['ls-remote', 'origin', 'refs/heads/feature']),
    ).toBe('');
    expect(readCurrentSha(fixture.repoPath, localArchiveBranch)).toBe(
        localFeatureSha,
    );
    expectArchivedBranchReflogExists(fixture.repoPath, localArchiveBranch);
}

function applyFeatureAndReadArchiveRefs(
    fixture: GitFixture,
    remoteFeatureSha: string,
): FeatureArchiveRefs {
    const applyReport = runGitCleanupJson(fixture.repoPath, [
        'git-cleanup',
        '--apply',
        '--keep-archives',
    ]);
    const applyResult = findApplyResult(applyReport, 'feature');

    expectFeatureDeletedLocallyAndRemotely(
        fixture,
        applyResult,
        remoteFeatureSha,
    );

    return readFeatureArchiveRefs(fixture);
}

function readFeatureArchiveRefs(fixture: GitFixture): FeatureArchiveRefs {
    const localArchiveBranch = ensurePresent(
        findArchivedBranch(fixture.repoPath, 'local', 'feature'),
        'Expected a local archive branch before pruning.',
    );
    const remoteArchiveBranch = ensurePresent(
        findArchivedBranch(fixture.originPath, 'remote', 'feature'),
        'Expected a remote archive branch before pruning.',
    );

    return {
        localArchiveRef: `refs/heads/${localArchiveBranch}`,
        remoteArchiveRef: `refs/heads/${remoteArchiveBranch}`,
    };
}

function expectPrunedFeatureArchives(
    pruneReport: GitCleanupReportType,
    fixture: GitFixture,
    refs: FeatureArchiveRefs,
): void {
    const localPruneResult = findArchivePruneResult(
        pruneReport,
        fixture.repoPath,
        refs.localArchiveRef,
    );
    const remotePruneResult = findArchivePruneResult(
        pruneReport,
        fixture.originPath,
        refs.remoteArchiveRef,
    );

    expect(localPruneResult?.pruned).toBe(true);
    expect(localPruneResult?.errors).toEqual([]);
    expect(localPruneResult?.skippedReason).toBeNull();
    expect(remotePruneResult?.pruned).toBe(true);
    expect(remotePruneResult?.errors).toEqual([]);
    expect(remotePruneResult?.skippedReason).toBeNull();
}

function expectFeatureArchivesPruned(fixture: GitFixture): void {
    expect(findArchivedBranch(fixture.repoPath, 'local', 'feature')).toBeNull();
    expect(
        findArchivedBranch(fixture.originPath, 'remote', 'feature'),
    ).toBeNull();
}

function expectApplyAndPruneReport(
    applyReport: GitCleanupReportType,
    fixture: GitFixture,
    remoteFeatureSha: string,
): void {
    const applyResult = findApplyResult(applyReport, 'feature');
    const pruneResults = applyReport.archivePruneResults ?? [];

    expect(applyReport.mode).toBe('apply');
    expect(applyResult?.localBranchDeleted).toBe(true);
    expect(applyResult?.remoteBranchDeleted).toBe(true);
    expect(readCurrentSha(fixture.repoPath, 'main')).toBe(remoteFeatureSha);
    expect(pruneResults).toHaveLength(2);
    expect(pruneResults.every((result) => result.pruned)).toBe(true);
}

function expectNoPostApplyDeleteGuidance(
    applyReport: GitCleanupReportType,
    branchName: string,
): void {
    const postApplyBranch = findBranchReport(
        applyReport,
        'needsReview',
        branchName,
    );

    expect(findBranchReport(applyReport, 'safeDelete', branchName)).toBe(
        undefined,
    );
    expect(postApplyBranch?.deleteCommands).toEqual([]);
    expect(postApplyBranch?.opinion.reason).toContain(
        'no further delete command',
    );
}

function expectArchiveBranchesHiddenAfterPrune(repoPath: string): void {
    git(repoPath, ['fetch', 'origin', '--prune'], false);
    const postApplyAudit = runGitCleanupJson(repoPath, ['git-cleanup']);

    expect(
        [
            ...postApplyAudit.branches.safeDelete,
            ...postApplyAudit.branches.needsReview,
        ].some((candidate) =>
            candidate.name.startsWith('slop-refinery/archive/'),
        ),
    ).toBe(false);
}

function createAuditedSafeDeleteFeatureFixture(): {
    fixture: GitFixture;
    remoteFeatureSha: string;
} {
    const fixture = createGitFixture();

    createMergedFeatureBranch(fixture.repoPath, 'feature', {
        pushRemote: true,
    });

    const auditReport = runGitCleanupJson(fixture.repoPath, ['git-cleanup']);
    const safeDeleteBranch = findBranchReport(
        auditReport,
        'safeDelete',
        'feature',
    );
    const remoteFeatureSha = git(fixture.repoPath, [
        'rev-parse',
        'origin/feature',
    ]);

    expect(safeDeleteBranch?.classification).toBe('safe_delete');
    expectSafeDeleteCommandsUseGuardedApply(safeDeleteBranch);

    return { fixture, remoteFeatureSha };
}

function expectSafeDeleteCommandsUseGuardedApply(
    branch: GitCleanupBranchReport | undefined,
): void {
    expect(branch?.deleteCommands).toEqual(
        expect.arrayContaining([
            expect.stringContaining('git-cleanup --apply'),
        ]),
    );
    expect(branch?.deleteCommands.join('\n')).not.toContain('git branch -m');
    expect(branch?.deleteCommands.join('\n')).not.toContain(
        '<local-origin-path>',
    );
}

function expectSafeDeleteBranch(
    report: GitCleanupReportType,
    branchName = 'feature',
): GitCleanupBranchReport {
    const safeDeleteBranch = findBranchReport(report, 'safeDelete', branchName);

    expect(safeDeleteBranch?.classification).toBe('safe_delete');

    if (safeDeleteBranch === undefined) {
        throw new Error(`Expected ${branchName} to be safe_delete.`);
    }

    return safeDeleteBranch;
}

function buildGitCleanupStressScenario(seed: number): GitCleanupStressScenario {
    const localModes: readonly GitCleanupStressLocalMode[] = [
        'clean',
        'hidden_ref',
        'tag_reflog',
        'detached',
    ];
    const remoteModes: readonly GitCleanupStressRemoteMode[] = [
        'clean',
        'hidden_ref',
        'tag_reflog',
        'live_drift',
        'stale_tracking',
        'absent_no_upstream',
    ];

    return {
        localMode: localModes[readSeededIndex(seed, localModes.length)],
        remoteMode:
            remoteModes[readSeededIndex(seed >>> 4, remoteModes.length)],
        seed,
    };
}

function buildGitCleanupStressScenarios(): GitCleanupStressScenario[] {
    return [
        {
            localMode: 'clean',
            remoteMode: 'clean',
            seed: 0,
        },
        ...[0x147, 0x29d, 0x3f2, 0x488, 0x5bc, 0x671, 0x72e, 0x8a5].map(
            buildGitCleanupStressScenario,
        ),
    ];
}

function readSeededIndex(seed: number, length: number): number {
    return (Math.imul(seed ^ 0x9e3779b9, 2_654_435_761) >>> 0) % length;
}

function applyGitCleanupStressScenario(
    fixture: GitFixture,
    scenario: GitCleanupStressScenario,
): void {
    applyGitCleanupStressLocalMode(fixture, scenario);
    applyGitCleanupStressRemoteMode(fixture, scenario);
}

function applyGitCleanupStressLocalMode(
    fixture: GitFixture,
    scenario: GitCleanupStressScenario,
): void {
    if (scenario.localMode === 'clean') {
        return;
    }

    if (scenario.localMode === 'hidden_ref') {
        createHiddenLocalRefNotOnBase(
            fixture.repoPath,
            `refs/original/stress-local-${scenario.seed}`,
        );
        return;
    }

    if (scenario.localMode === 'tag_reflog') {
        createMovedTagReflogHistoryNotOnBase(
            fixture.repoPath,
            `stress-local-tag-${scenario.seed}`,
        );
        return;
    }

    createDetachedWorktreeWithLocalOnlyCommit(
        fixture,
        'feature',
        path.join(fixture.tempPath, `stress-detached-${scenario.seed}`),
    );
}

function applyGitCleanupStressRemoteMode(
    fixture: GitFixture,
    scenario: GitCleanupStressScenario,
): void {
    switch (scenario.remoteMode) {
        case 'absent_no_upstream':
            deleteRemoteBranchFromSecondClone(fixture, 'feature');
            unsetUpstreamAndDeleteTracking(fixture.repoPath, 'feature');
            return;
        case 'clean':
            return;
        case 'hidden_ref':
            createHiddenRemoteRefNotOnBase(
                fixture,
                `refs/original/stress-remote-${scenario.seed}`,
            );
            return;
        case 'live_drift':
            advanceRemoteBranchFromSecondClone(fixture, 'feature');
            return;
        case 'stale_tracking':
            createStaleTrackingRefNotOnBase(fixture, 'feature');
            return;
        case 'tag_reflog':
            createMovedRemoteTagReflogHistoryNotOnBase(
                fixture,
                `stress-remote-tag-${scenario.seed}`,
            );
    }
}

function expectGitCleanupStressInvariant(
    report: GitCleanupReportType,
    scenario: GitCleanupStressScenario,
): void {
    const safeDeleteBranch = findBranchReport(report, 'safeDelete', 'feature');
    const needsReviewBranch = findBranchReport(
        report,
        'needsReview',
        'feature',
    );
    const expectedSafe = ['absent_no_upstream', 'clean'].includes(
        scenario.remoteMode,
    );

    if (expectedSafe) {
        expect(safeDeleteBranch?.classification).toBe('safe_delete');
        expectSafeDeleteCommandsUseGuardedApply(safeDeleteBranch);
        return;
    }

    expect(safeDeleteBranch).toBe(undefined);
    expect(needsReviewBranch?.classification).toBe('needs_review');
    expect(needsReviewBranch?.state.safeToDelete).toBe(false);
    expect(needsReviewBranch?.reasonCodes.length).toBeGreaterThan(0);
}

function advanceRemoteBranchFromSecondClone(
    fixture: GitFixture,
    branchName: string,
): void {
    const secondClonePath = readSecondClonePath(fixture);
    git(secondClonePath, ['checkout', branchName], false);
    commitFile(
        secondClonePath,
        'late-change.txt',
        'late\n',
        `Advance ${branchName} remotely`,
    );
    git(secondClonePath, ['push', 'origin', branchName], false);
}

function createForcePushedRemoteHistoryNotOnBase(
    fixture: GitFixture,
    branchName: string,
): void {
    const secondClonePath = readSecondClonePath(fixture);
    const originalBranchSha = readCurrentSha(fixture.repoPath, branchName);
    git(secondClonePath, ['checkout', branchName], false);
    commitFile(
        secondClonePath,
        'force-pushed-away.txt',
        'force-pushed-away\n',
        'Create remote-only history',
    );
    git(secondClonePath, ['push', 'origin', branchName], false);
    git(secondClonePath, ['reset', '--hard', originalBranchSha], false);
    git(secondClonePath, ['push', '--force', 'origin', branchName], false);
    git(fixture.repoPath, ['fetch', 'origin', branchName], false);
}

function installRemoteDriftOnLocalArchiveHook(
    fixture: GitFixture,
    secondClonePath: string,
    branchName: string,
): void {
    const markerPath = path.join(fixture.tempPath, 'remote-drift-hook-ran');
    const hooksPath = path.join(readAbsoluteGitDir(fixture.repoPath), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `git -C ${shellQuote(secondClonePath)} push origin HEAD:${shellQuote(branchName)} >/dev/null 2>&1`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installRemoteReflogMutationOnLocalArchiveHook(
    fixture: GitFixture,
    branchName: string,
    branchSha: string,
): void {
    const markerPath = path.join(
        fixture.tempPath,
        'remote-reflog-mutation-hook-ran',
    );
    const hooksPath = path.join(readAbsoluteGitDir(fixture.repoPath), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const remoteReflogPath = path.join(
        fixture.originPath,
        'logs',
        'refs',
        'heads',
        branchName,
    );

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `printf '%s %s Slop Refiner <slop-refinery@example.com> 0 +0000\\tmutate remote proof\\n' ${shellQuote(branchSha)} ${shellQuote(branchSha)} >> ${shellQuote(remoteReflogPath)}`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installLocalTrackingRefMutationOnRemoteArchiveHook(
    fixture: GitFixture,
    branchName: string,
): void {
    const markerPath = path.join(
        fixture.tempPath,
        'local-tracking-mutation-remote-archive-hook-ran',
    );
    const hooksPath = path.join(
        readAbsoluteGitDir(fixture.originPath),
        'hooks',
    );
    const hookPath = path.join(hooksPath, 'reference-transaction');

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `TREE=$(git -C ${shellQuote(fixture.repoPath)} rev-parse 'main^{tree}') || exit $?`,
            `PARENT=$(git -C ${shellQuote(fixture.repoPath)} rev-parse main) || exit $?`,
            `TARGET=$(printf '%s\\n' 'Create local tracking drift' | git -C ${shellQuote(fixture.repoPath)} commit-tree "$TREE" -p "$PARENT") || exit $?`,
            `git -C ${shellQuote(fixture.repoPath)} update-ref ${shellQuote(`refs/remotes/origin/${branchName}`)} "$TARGET" >/dev/null 2>&1 || exit $?`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installRemoteBranchRecreateBeforeFinalAbsentProbe(
    fixture: GitFixture,
    branchName: string,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(
        fixture.tempPath,
        'git-wrapper-absent-remote-final',
    );
    const markerPath = path.join(wrapperDir, 'local-archive-committed');
    const counterPath = path.join(wrapperDir, 'branch-probe-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();
    const hooksPath = path.join(readAbsoluteGitDir(fixture.repoPath), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'if [ "$1" = "committed" ]; then',
            `  touch ${shellQuote(markerPath)}`,
            'fi',
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `MARKER=${shellQuote(markerPath)}`,
            `ORIGIN=${shellQuote(fixture.originPath)}`,
            `BRANCH=${shellQuote(branchName)}`,
            'if [ -f "$MARKER" ] && [ "$#" -eq 3 ] && [ "$1" = "ls-remote" ] && [ "$2" = "origin" ] && [ "$3" = "refs/heads/$BRANCH" ]; then',
            '  COUNT=0',
            '  if [ -f "$COUNTER" ]; then',
            '    COUNT=$(cat "$COUNTER")',
            '  fi',
            '  COUNT=$((COUNT + 1))',
            '  printf "%s\\n" "$COUNT" > "$COUNTER"',
            '  if [ "$COUNT" -eq 3 ]; then',
            '    "$REAL_GIT" -C "$ORIGIN" branch "$BRANCH" main || exit $?',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installOriginHeadRepointAfterHostedDelete(
    fixture: GitFixture,
    branchName: string,
    newDefaultBranch: string,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(
        fixture.tempPath,
        'git-wrapper-hosted-delete-head-drift',
    );
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `ORIGIN=${shellQuote(fixture.originPath)}`,
            `BRANCH=${shellQuote(branchName)}`,
            `NEW_DEFAULT=${shellQuote(newDefaultBranch)}`,
            'if [ "$#" -eq 4 ] && [ "$1" = "push" ] && [ "$2" = "origin" ] && [ "$4" = ":refs/heads/$BRANCH" ]; then',
            '  case "$3" in',
            '    --force-with-lease=refs/heads/"$BRANCH":*)',
            '      "$REAL_GIT" "$@"',
            '      STATUS=$?',
            '      if [ "$STATUS" -eq 0 ]; then',
            '        "$REAL_GIT" -C "$ORIGIN" branch "$NEW_DEFAULT" main || exit $?',
            '        "$REAL_GIT" -C "$ORIGIN" symbolic-ref HEAD "refs/heads/$NEW_DEFAULT" || exit $?',
            '      fi',
            '      exit "$STATUS"',
            '      ;;',
            '  esac',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function deleteOriginBranchButPreserveReflog(
    fixture: GitFixture,
    branchName: string,
): void {
    const remoteBranchSha = readCurrentSha(fixture.originPath, branchName);
    const remoteBranchReflogPath = path.join(
        fixture.originPath,
        'logs',
        'refs',
        'heads',
        branchName,
    );
    const remoteBranchReflog = readFileSync(remoteBranchReflogPath, 'utf8');

    git(
        fixture.originPath,
        ['update-ref', '-d', `refs/heads/${branchName}`, remoteBranchSha],
        false,
    );
    writeFile(remoteBranchReflogPath, remoteBranchReflog);
}

function installLocalArchiveDeletionOnRemoteArchiveHook(
    fixture: GitFixture,
    branchName: string,
): void {
    const markerPath = path.join(
        fixture.tempPath,
        'local-archive-deleted-during-remote-archive',
    );
    const hooksPath = path.join(
        readAbsoluteGitDir(fixture.originPath),
        'hooks',
    );
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const archiveRefRoot = path.join(
        readGitCommonDir(fixture.repoPath),
        'refs',
        'heads',
        'slop-refinery',
        'archive',
        'local',
        branchName,
    );
    const archiveLogRoot = path.join(
        readGitCommonDir(fixture.repoPath),
        'logs',
        'refs',
        'heads',
        'slop-refinery',
        'archive',
        'local',
        branchName,
    );

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `ARCHIVE_REF=$(find ${shellQuote(archiveRefRoot)} -type f 2>/dev/null | head -n 1)`,
            'if [ -z "$ARCHIVE_REF" ]; then',
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            'rm -f "$ARCHIVE_REF"',
            `ARCHIVE_LOG=$(find ${shellQuote(archiveLogRoot)} -type f 2>/dev/null | head -n 1)`,
            'if [ -n "$ARCHIVE_LOG" ]; then',
            '  rm -f "$ARCHIVE_LOG"',
            'fi',
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installLocalBranchRecreationOnRemoteArchiveHook(
    fixture: GitFixture,
    branchName: string,
): void {
    const markerPath = path.join(
        fixture.tempPath,
        'local-branch-recreated-during-remote-archive',
    );
    const hooksPath = path.join(
        readAbsoluteGitDir(fixture.originPath),
        'hooks',
    );
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const archiveRefRoot = path.join(
        readGitCommonDir(fixture.repoPath),
        'refs',
        'heads',
        'slop-refinery',
        'archive',
        'local',
        branchName,
    );

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `ARCHIVE_REF=$(find ${shellQuote(archiveRefRoot)} -type f 2>/dev/null | head -n 1)`,
            'if [ -z "$ARCHIVE_REF" ]; then',
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            'ARCHIVE_SHA=$(cat "$ARCHIVE_REF") || exit $?',
            `git -C ${shellQuote(fixture.repoPath)} update-ref ${shellQuote(`refs/heads/${branchName}`)} "$ARCHIVE_SHA" >/dev/null 2>&1 || exit $?`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installLocalArchiveCheckoutOnRemoteArchiveHook(
    fixture: GitFixture,
    branchName: string,
): void {
    const markerPath = path.join(
        fixture.tempPath,
        'local-archive-checked-out-during-remote-archive',
    );
    const hooksPath = path.join(
        readAbsoluteGitDir(fixture.originPath),
        'hooks',
    );
    const hookPath = path.join(hooksPath, 'reference-transaction');

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `ARCHIVE=$(git -C ${shellQuote(fixture.repoPath)} for-each-ref ${shellQuote(`refs/heads/slop-refinery/archive/local/${branchName}`)} "--format=%(refname:short)" | head -n 1)`,
            'if [ -z "$ARCHIVE" ]; then',
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `git -C ${shellQuote(fixture.repoPath)} checkout "$ARCHIVE" >/dev/null 2>&1 || exit $?`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installLocalArchiveDeletionHook(
    fixture: GitFixture,
    branchName: string,
): void {
    const markerPath = path.join(fixture.tempPath, 'local-archive-deleted');
    const hooksPath = path.join(readAbsoluteGitDir(fixture.repoPath), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const archiveRefRoot = path.join(
        readGitCommonDir(fixture.repoPath),
        'refs',
        'heads',
        'slop-refinery',
        'archive',
        'local',
        branchName,
    );
    const archiveLogRoot = path.join(
        readGitCommonDir(fixture.repoPath),
        'logs',
        'refs',
        'heads',
        'slop-refinery',
        'archive',
        'local',
        branchName,
    );

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `ARCHIVE_REF=$(find ${shellQuote(archiveRefRoot)} -type f 2>/dev/null | head -n 1)`,
            'if [ -z "$ARCHIVE_REF" ]; then',
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            'rm -f "$ARCHIVE_REF"',
            `ARCHIVE_LOG=$(find ${shellQuote(archiveLogRoot)} -type f 2>/dev/null | head -n 1)`,
            'if [ -n "$ARCHIVE_LOG" ]; then',
            '  rm -f "$ARCHIVE_LOG"',
            'fi',
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installArchiveReflogReplacementHook(
    repoPathToHook: string,
    tempPath: string,
    scope: 'local' | 'remote',
    branchName: string,
): void {
    const markerPath = path.join(tempPath, `${scope}-archive-reflog-replaced`);
    const hooksPath = path.join(readAbsoluteGitDir(repoPathToHook), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const archiveLogRoot = path.join(
        readGitCommonDir(repoPathToHook),
        'logs',
        'refs',
        'heads',
        'slop-refinery',
        'archive',
        scope,
        branchName,
    );
    const mainSha = readCurrentSha(repoPathToHook, 'main');

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `ARCHIVE_LOG=$(find ${shellQuote(archiveLogRoot)} -type f 2>/dev/null | head -n 1)`,
            'if [ -z "$ARCHIVE_LOG" ]; then',
            '  exit 0',
            'fi',
            `printf '%s %s Slop Refiner <slop-refinery@example.com> 0 +0000\\treplace archive reflog\\n' ${shellQuote(mainSha)} ${shellQuote(mainSha)} > "$ARCHIVE_LOG"`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installArchiveReflogAppendHook(
    repoPathToHook: string,
    tempPath: string,
    scope: 'local' | 'remote',
    branchName: string,
    fromSha: string,
    toSha: string,
): void {
    const markerPath = path.join(tempPath, `${scope}-archive-reflog-appended`);
    const hooksPath = path.join(readAbsoluteGitDir(repoPathToHook), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const archiveLogRoot = path.join(
        readGitCommonDir(repoPathToHook),
        'logs',
        'refs',
        'heads',
        'slop-refinery',
        'archive',
        scope,
        branchName,
    );

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `ARCHIVE_LOG=$(find ${shellQuote(archiveLogRoot)} -type f 2>/dev/null | head -n 1)`,
            'if [ -z "$ARCHIVE_LOG" ]; then',
            '  exit 0',
            'fi',
            `printf '%s %s Slop Refiner <slop-refinery@example.com> 0 +0000\\tappend unsafe archive reflog\\n' ${shellQuote(fromSha)} ${shellQuote(toSha)} >> "$ARCHIVE_LOG"`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installRestoredBranchReflogAppendHook(
    repoPathToHook: string,
    tempPath: string,
    branchName: string,
    fromSha: string,
    toSha: string,
): void {
    const markerPath = path.join(tempPath, 'restored-branch-reflog-appended');
    const hooksPath = path.join(readAbsoluteGitDir(repoPathToHook), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const restoredLogPath = path.join(
        readGitCommonDir(repoPathToHook),
        'logs',
        'refs',
        'heads',
        ...branchName.split('/'),
    );

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `printf '%s %s Slop Refiner <slop-refinery@example.com> 0 +0000\\tappend unsafe restore reflog\\n' ${shellQuote(fromSha)} ${shellQuote(toSha)} >> ${shellQuote(restoredLogPath)}`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installPrimaryDetachedWorktreeOnLocalArchiveHook(
    fixture: GitFixture,
): void {
    const markerPath = path.join(
        fixture.tempPath,
        'primary-detached-local-archive-hook-ran',
    );
    const hooksPath = path.join(readAbsoluteGitDir(fixture.repoPath), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `git -C ${shellQuote(fixture.repoPath)} checkout --detach main >/dev/null 2>&1 || exit $?`,
            `printf '%s\\n' post-archive-detached > ${shellQuote(path.join(fixture.repoPath, 'post-archive-detached.txt'))}`,
            `git -C ${shellQuote(fixture.repoPath)} add post-archive-detached.txt || exit $?`,
            `git -C ${shellQuote(fixture.repoPath)} commit -m "Create post-archive detached work" >/dev/null 2>&1 || exit $?`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installArchiveCheckoutDuringPostArchiveSafetyHook(
    fixture: GitFixture,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(
        fixture.tempPath,
        'git-wrapper-archive-checkout',
    );
    const markerPath = path.join(wrapperDir, 'archive-checkout-ran');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `REPO=${shellQuote(fixture.repoPath)}`,
            `MARKER=${shellQuote(markerPath)}`,
            'if [ "$#" -eq 3 ] && [ "$1" = "remote" ] && [ "$2" = "get-url" ] && [ "$3" = "origin" ] && [ ! -f "$MARKER" ]; then',
            '  ARCHIVE=$("$REAL_GIT" -C "$REPO" for-each-ref "refs/heads/slop-refinery/archive/local/feature" "--format=%(refname:short)" | head -n 1)',
            '  if [ -n "$ARCHIVE" ]; then',
            '    touch "$MARKER"',
            '    "$REAL_GIT" -C "$REPO" checkout "$ARCHIVE" >/dev/null 2>&1 || exit $?',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installExistsSyncFailureAfterRemoteArchive(
    fixture: GitFixture,
): NodeJS.ProcessEnv {
    const preloadPath = path.join(
        fixture.tempPath,
        'throw-after-remote-archive.cjs',
    );

    writeFile(
        preloadPath,
        [
            "const fs = require('node:fs');",
            "const path = require('node:path');",
            "const { syncBuiltinESMExports } = require('node:module');",
            'const originalExistsSync = fs.existsSync;',
            'const origin = process.env.SLOP_REFINERY_TEST_ORIGIN;',
            'const localArchiveLogRoot = process.env.SLOP_REFINERY_TEST_LOCAL_ARCHIVE_LOG_ROOT;',
            'let thrown = false;',
            'fs.existsSync = function patchedExistsSync(targetPath) {',
            "  if (!thrown && origin && localArchiveLogRoot && typeof targetPath === 'string') {",
            "    const remoteArchiveRoot = path.join(origin, 'refs', 'heads', 'slop-refinery', 'archive', 'remote', 'feature');",
            '    if (targetPath.startsWith(`${localArchiveLogRoot}${path.sep}`) && originalExistsSync(remoteArchiveRoot)) {',
            '      thrown = true;',
            "      throw new Error('forced post-remote archive existsSync failure');",
            '    }',
            '  }',
            '  return originalExistsSync.apply(this, arguments);',
            '};',
            'syncBuiltinESMExports();',
            '',
        ].join('\n'),
    );

    return {
        NODE_OPTIONS: [
            process.env.NODE_OPTIONS ?? '',
            `--require=${preloadPath}`,
        ]
            .filter((value) => value !== '')
            .join(' '),
        SLOP_REFINERY_TEST_LOCAL_ARCHIVE_LOG_ROOT: path.join(
            readGitCommonDir(fixture.repoPath),
            'logs',
            'refs',
            'heads',
            'slop-refinery',
            'archive',
            'local',
        ),
        SLOP_REFINERY_TEST_ORIGIN: fixture.originPath,
    };
}

function installDirtyWorktreeOnLocalArchiveHook(fixture: GitFixture): void {
    const markerPath = path.join(
        fixture.tempPath,
        'dirty-worktree-local-archive-hook-ran',
    );
    const hooksPath = path.join(readAbsoluteGitDir(fixture.repoPath), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const dirtyPath = path.join(fixture.repoPath, 'post-archive-dirty.txt');

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `printf '%s\\n' post-archive-dirty > ${shellQuote(dirtyPath)}`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function installDirtyWorktreeAndGraftOnLocalArchiveHook(
    fixture: GitFixture,
): void {
    const markerPath = path.join(
        fixture.tempPath,
        'dirty-worktree-graft-local-archive-hook-ran',
    );
    const hooksPath = path.join(readAbsoluteGitDir(fixture.repoPath), 'hooks');
    const hookPath = path.join(hooksPath, 'reference-transaction');
    const dirtyPath = path.join(fixture.repoPath, 'post-archive-dirty.txt');
    const infoPath = path.join(readGitCommonDir(fixture.repoPath), 'info');
    const graftPath = path.join(infoPath, 'grafts');

    writeFile(
        hookPath,
        [
            '#!/bin/sh',
            'if [ "$1" != "committed" ]; then',
            '  exit 0',
            'fi',
            `if [ -f ${shellQuote(markerPath)} ]; then`,
            '  exit 0',
            'fi',
            `touch ${shellQuote(markerPath)}`,
            `printf '%s\\n' post-archive-dirty > ${shellQuote(dirtyPath)}`,
            `mkdir -p ${shellQuote(infoPath)}`,
            `printf '%s\\n' 'deadbeef deadbeef' > ${shellQuote(graftPath)}`,
            '',
        ].join('\n'),
    );
    chmodSync(hookPath, 0o755);
}

function expectLocalArchiveRestorePreservedBackup(
    fixture: GitFixture,
    featureSha: string,
    applyResult: ReturnType<typeof findApplyResult>,
): void {
    const localBackupRef = applyResult?.localBackupRef;

    expect(applyResult?.localBranchDeleted).toBe(false);
    expect(localBackupRef).not.toBeNull();
    expect(localBackupRef).not.toBeUndefined();

    if (localBackupRef === null || localBackupRef === undefined) {
        throw new Error('Expected a preserved local backup ref.');
    }

    expectRestoredFeatureAndBackup(fixture, featureSha, localBackupRef);
}

function expectRestoredFeatureAndBackup(
    fixture: GitFixture,
    featureSha: string,
    localBackupRef: string,
): void {
    const localArchiveBranch = localBackupRef.replace(/^refs\/heads\//u, '');

    expect(readCurrentSha(fixture.repoPath, 'feature')).toBe(featureSha);
    expect(readCurrentSha(fixture.repoPath, localArchiveBranch)).toBe(
        featureSha,
    );
}

function installHiddenRefBeforeSecondHiddenRefScan(
    fixture: GitFixture,
    refName: string,
    targetSha: string,
): NodeJS.ProcessEnv {
    return installHiddenRefBeforeNthHiddenRefScan(
        fixture,
        refName,
        targetSha,
        2,
    );
}

function installHiddenRefBeforeNthHiddenRefScan(
    fixture: GitFixture,
    refName: string,
    targetSha: string,
    scanNumber: number,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(fixture.tempPath, 'git-wrapper');
    const counterPath = path.join(wrapperDir, 'hidden-ref-scan-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `REPO=${shellQuote(fixture.repoPath)}`,
            `REF=${shellQuote(refName)}`,
            `TARGET=${shellQuote(targetSha)}`,
            `SCAN=${scanNumber}`,
            'if [ "$#" -eq 2 ] && [ "$1" = "for-each-ref" ] && [ "$2" = "--format=%(refname)" ]; then',
            '  COUNT=0',
            '  if [ -f "$COUNTER" ]; then',
            '    COUNT=$(cat "$COUNTER")',
            '  fi',
            '  COUNT=$((COUNT + 1))',
            '  printf "%s\\n" "$COUNT" > "$COUNTER"',
            '  if [ "$COUNT" -eq "$SCAN" ]; then',
            '    "$REAL_GIT" -C "$REPO" update-ref "$REF" "$TARGET" || exit $?',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installGeneratedHiddenRefBeforeNthHiddenRefScan(
    fixture: GitFixture,
    refName: string,
    scanNumber: number,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(fixture.tempPath, 'git-wrapper');
    const counterPath = path.join(wrapperDir, 'hidden-ref-scan-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `REPO=${shellQuote(fixture.repoPath)}`,
            `REF=${shellQuote(refName)}`,
            `SCAN=${scanNumber}`,
            'if [ "$#" -eq 2 ] && [ "$1" = "for-each-ref" ] && [ "$2" = "--format=%(refname)" ]; then',
            '  COUNT=0',
            '  if [ -f "$COUNTER" ]; then',
            '    COUNT=$(cat "$COUNTER")',
            '  fi',
            '  COUNT=$((COUNT + 1))',
            '  printf "%s\\n" "$COUNT" > "$COUNTER"',
            '  if [ "$COUNT" -eq "$SCAN" ]; then',
            '    TREE=$("$REAL_GIT" -C "$REPO" rev-parse main^{tree}) || exit $?',
            '    TARGET=$("$REAL_GIT" -C "$REPO" commit-tree "$TREE" -p main -m "Create late hidden ref proof drift") || exit $?',
            '    "$REAL_GIT" -C "$REPO" update-ref "$REF" "$TARGET" || exit $?',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installReplaceRefBeforeNthLocalRewriteOverlayCheck(
    fixture: GitFixture,
    objectSha: string,
    replacementSha: string,
    scanNumber: number,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(fixture.tempPath, 'git-wrapper-replace-ref');
    const counterPath = path.join(wrapperDir, 'replace-ref-scan-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `REPO=${shellQuote(fixture.repoPath)}`,
            `OBJECT=${shellQuote(objectSha)}`,
            `REPLACEMENT=${shellQuote(replacementSha)}`,
            `SCAN=${scanNumber}`,
            'CURRENT=$(pwd -P)',
            'REPO_REAL=$(cd "$REPO" && pwd -P)',
            'if [ "$#" -eq 3 ] && [ "$1" = "for-each-ref" ] && [ "$2" = "refs/replace" ] && [ "$3" = "--format=%(refname)" ] && [ "$CURRENT" = "$REPO_REAL" ]; then',
            '  COUNT=0',
            '  if [ -f "$COUNTER" ]; then',
            '    COUNT=$(cat "$COUNTER")',
            '  fi',
            '  COUNT=$((COUNT + 1))',
            '  printf "%s\\n" "$COUNT" > "$COUNTER"',
            '  if [ "$COUNT" -eq "$SCAN" ]; then',
            '    "$REAL_GIT" -C "$REPO" update-ref "refs/replace/$OBJECT" "$REPLACEMENT" || exit $?',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installOriginHeadRepointBeforeFourthOriginHeadRead(
    fixture: GitFixture,
    newDefaultBranch: string,
): NodeJS.ProcessEnv {
    return installOriginHeadRepointBeforeNthOriginHeadRead(
        fixture,
        newDefaultBranch,
        4,
    );
}

function installOriginHeadRepointBeforeNthOriginHeadRead(
    fixture: GitFixture,
    newDefaultBranch: string,
    readNumber: number,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(fixture.tempPath, 'git-wrapper-base-drift');
    const counterPath = path.join(wrapperDir, 'origin-head-read-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `ORIGIN=${shellQuote(fixture.originPath)}`,
            `NEW_DEFAULT=${shellQuote(newDefaultBranch)}`,
            `READ_NUMBER=${readNumber}`,
            'if [ "$#" -eq 4 ] && [ "$1" = "ls-remote" ] && [ "$2" = "--symref" ] && [ "$3" = "origin" ] && [ "$4" = "HEAD" ]; then',
            '  COUNT=0',
            '  if [ -f "$COUNTER" ]; then',
            '    COUNT=$(cat "$COUNTER")',
            '  fi',
            '  COUNT=$((COUNT + 1))',
            '  printf "%s\\n" "$COUNT" > "$COUNTER"',
            '  if [ "$COUNT" -eq "$READ_NUMBER" ]; then',
            '    "$REAL_GIT" -C "$ORIGIN" symbolic-ref HEAD "refs/heads/$NEW_DEFAULT" || exit $?',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installOriginHeadRepointBeforeNthArchivedOriginHeadRead(
    fixture: GitFixture,
    newDefaultBranch: string,
    readNumber: number,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(
        fixture.tempPath,
        'git-wrapper-archived-base-drift',
    );
    const counterPath = path.join(wrapperDir, 'archived-origin-head-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `REPO=${shellQuote(fixture.repoPath)}`,
            `ORIGIN=${shellQuote(fixture.originPath)}`,
            `NEW_DEFAULT=${shellQuote(newDefaultBranch)}`,
            `READ_NUMBER=${readNumber}`,
            'if [ "$#" -eq 4 ] && [ "$1" = "ls-remote" ] && [ "$2" = "--symref" ] && [ "$3" = "origin" ] && [ "$4" = "HEAD" ]; then',
            '  LOCAL_ARCHIVE=$("$REAL_GIT" -C "$REPO" for-each-ref "refs/heads/slop-refinery/archive/local/feature" "--format=%(refname)" | head -n 1)',
            '  REMOTE_ARCHIVE=$("$REAL_GIT" -C "$ORIGIN" for-each-ref "refs/heads/slop-refinery/archive/remote/feature" "--format=%(refname)" | head -n 1)',
            '  if [ -n "$LOCAL_ARCHIVE" ] && [ -n "$REMOTE_ARCHIVE" ]; then',
            '    COUNT=0',
            '    if [ -f "$COUNTER" ]; then',
            '      COUNT=$(cat "$COUNTER")',
            '    fi',
            '    COUNT=$((COUNT + 1))',
            '    printf "%s\\n" "$COUNT" > "$COUNTER"',
            '    if [ "$COUNT" -eq "$READ_NUMBER" ]; then',
            '      "$REAL_GIT" -C "$ORIGIN" symbolic-ref HEAD "refs/heads/$NEW_DEFAULT" || exit $?',
            '    fi',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installOriginCheckoutArchiveOnSecondPostArchiveWorktreeList(
    fixture: GitFixture,
    branchName: string,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(
        fixture.tempPath,
        'git-wrapper-origin-archive',
    );
    const archiveWorktreePath = path.join(
        fixture.tempPath,
        'origin-archive-worktree',
    );
    const counterPath = path.join(
        wrapperDir,
        'origin-post-archive-worktree-count',
    );
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `ORIGIN=${shellQuote(fixture.originPath)}`,
            `BRANCH=${shellQuote(branchName)}`,
            `ARCHIVE_WORKTREE=${shellQuote(archiveWorktreePath)}`,
            'CURRENT=$(pwd -P)',
            'ORIGIN_REAL=$(cd "$ORIGIN" && pwd -P)',
            'if [ "$CURRENT" = "$ORIGIN_REAL" ] && [ "$#" -ge 2 ] && [ "$1" = "worktree" ] && [ "$2" = "list" ]; then',
            '  ARCHIVE=$("$REAL_GIT" -C "$ORIGIN" for-each-ref "refs/heads/slop-refinery/archive/remote/$BRANCH" --format="%(refname:short)" | head -n 1)',
            '  if [ -n "$ARCHIVE" ]; then',
            '    COUNT=0',
            '    if [ -f "$COUNTER" ]; then',
            '      COUNT=$(cat "$COUNTER")',
            '    fi',
            '    COUNT=$((COUNT + 1))',
            '    printf "%s\\n" "$COUNT" > "$COUNTER"',
            '    if [ "$COUNT" -eq 2 ]; then',
            '      "$REAL_GIT" -C "$ORIGIN" worktree add "$ARCHIVE_WORKTREE" "$ARCHIVE" >/dev/null 2>&1 || exit $?',
            '    fi',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installDetachedWorktreeBeforeThirdWorktreeList(
    fixture: GitFixture,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(fixture.tempPath, 'git-wrapper-detached');
    const counterPath = path.join(wrapperDir, 'worktree-list-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const detachedWorktreePath = path.join(
        fixture.tempPath,
        'final-detached-worktree',
    );
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `REPO=${shellQuote(fixture.repoPath)}`,
            `DETACHED=${shellQuote(detachedWorktreePath)}`,
            'if [ "$#" -ge 2 ] && [ "$1" = "worktree" ] && [ "$2" = "list" ]; then',
            '  COUNT=0',
            '  if [ -f "$COUNTER" ]; then',
            '    COUNT=$(cat "$COUNTER")',
            '  fi',
            '  COUNT=$((COUNT + 1))',
            '  printf "%s\\n" "$COUNT" > "$COUNTER"',
            '  if [ "$COUNT" -ge 2 ] && [ ! -d "$DETACHED" ]; then',
            '    "$REAL_GIT" -C "$REPO" worktree add --detach "$DETACHED" feature >/dev/null 2>&1 || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" config user.email slop-refinery@example.com || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" config user.name "Slop Refiner" || exit $?',
            '    printf "%s\\n" final-detached > "$DETACHED/final-detached.txt"',
            '    "$REAL_GIT" -C "$DETACHED" add final-detached.txt || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" commit -m "Create final detached work" >/dev/null 2>&1 || exit $?',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function installDetachedWorktreePrivateRefBeforeFinalWorktreeList(
    fixture: GitFixture,
): NodeJS.ProcessEnv {
    const wrapperDir = path.join(
        fixture.tempPath,
        'git-wrapper-private-detached',
    );
    const counterPath = path.join(wrapperDir, 'worktree-list-count');
    const gitWrapperPath = path.join(wrapperDir, 'git');
    const detachedWorktreePath = path.join(
        fixture.tempPath,
        'final-private-ref-worktree',
    );
    const realGitPath = execFileSync('which', ['git'], {
        encoding: 'utf8',
    }).trim();

    mkdirSync(wrapperDir, { recursive: true });
    writeFile(
        gitWrapperPath,
        [
            '#!/bin/sh',
            `REAL_GIT=${shellQuote(realGitPath)}`,
            `COUNTER=${shellQuote(counterPath)}`,
            `REPO=${shellQuote(fixture.repoPath)}`,
            `DETACHED=${shellQuote(detachedWorktreePath)}`,
            'if [ "$#" -ge 2 ] && [ "$1" = "worktree" ] && [ "$2" = "list" ]; then',
            '  COUNT=0',
            '  if [ -f "$COUNTER" ]; then',
            '    COUNT=$(cat "$COUNTER")',
            '  fi',
            '  COUNT=$((COUNT + 1))',
            '  printf "%s\\n" "$COUNT" > "$COUNTER"',
            '  if [ "$COUNT" -ge 2 ] && [ ! -d "$DETACHED" ]; then',
            '    "$REAL_GIT" -C "$REPO" worktree add --detach "$DETACHED" main >/dev/null 2>&1 || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" config user.email slop-refinery@example.com || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" config user.name "Slop Refiner" || exit $?',
            '    printf "%s\\n" final-private-ref > "$DETACHED/final-private-ref.txt"',
            '    "$REAL_GIT" -C "$DETACHED" add final-private-ref.txt || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" commit -m "Create final private ref work" >/dev/null 2>&1 || exit $?',
            '    OFFBASE=$("$REAL_GIT" -C "$DETACHED" rev-parse HEAD) || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" update-ref refs/worktree/final-private "$OFFBASE" || exit $?',
            '    "$REAL_GIT" -C "$DETACHED" checkout --detach main >/dev/null 2>&1 || exit $?',
            '    rm -f "$("$REAL_GIT" -C "$DETACHED" rev-parse --absolute-git-dir)/logs/HEAD"',
            '  fi',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
        ].join('\n'),
    );
    chmodSync(gitWrapperPath, 0o755);

    return {
        PATH: `${wrapperDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
}

function createOriginPrefixedRemoteNameFixture(): GitFixture {
    const fixture = createGitFixture();
    const otherOriginPath = path.join(fixture.tempPath, 'origin-foo.git');

    git(fixture.tempPath, ['init', '--bare', otherOriginPath], false);
    configureFixtureHistoryRetention(otherOriginPath);
    createCanonicalFooFeatureBranch(fixture.repoPath);
    git(
        fixture.repoPath,
        ['remote', 'add', 'origin-foo', otherOriginPath],
        false,
    );
    git(fixture.repoPath, ['checkout', 'foo/feature'], false);
    git(
        fixture.repoPath,
        ['push', '-u', 'origin-foo', 'foo/feature:feature'],
        false,
    );
    git(fixture.repoPath, ['checkout', 'main'], false);

    return fixture;
}

function createCanonicalFooFeatureBranch(repoPath: string): void {
    git(repoPath, ['checkout', '-b', 'foo/feature'], false);
    commitFile(
        repoPath,
        'foo-feature.txt',
        'foo-feature\n',
        'Add foo/feature work',
    );
    git(repoPath, ['push', '-u', 'origin', 'foo/feature'], false);
    git(repoPath, ['checkout', 'main'], false);
    git(repoPath, ['merge', '--ff-only', 'foo/feature'], false);
    git(repoPath, ['push', 'origin', 'main'], false);
}

function expectOriginPrefixedRemoteNeedsReview(
    auditReport: GitCleanupReportType,
): void {
    const reviewBranch = findBranchReport(
        auditReport,
        'needsReview',
        'foo/feature',
    );

    expect(reviewBranch?.remoteBranch?.remote).toBe('origin-foo');
    expect(reviewBranch?.remoteBranch?.branch).toBe('feature');
    expect(reviewBranch?.reasonCodes).toContain(
        'origin_branch_non_origin_upstream',
    );
    expect(findBranchReport(auditReport, 'safeDelete', 'foo/feature')).toBe(
        undefined,
    );
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function createStaleTrackingRefNotOnBase(
    fixture: GitFixture,
    branchName: string,
): void {
    const secondClonePath = readSecondClonePath(fixture);
    git(secondClonePath, ['checkout', branchName], false);
    commitFile(
        secondClonePath,
        'stale-tracking.txt',
        'stale-tracking\n',
        'Advance remote branch beyond main',
    );
    git(secondClonePath, ['push', 'origin', branchName], false);
    git(fixture.repoPath, ['fetch', 'origin'], false);
    git(secondClonePath, ['push', 'origin', `:${branchName}`], false);
}

function createHiddenRemoteRefNotOnBase(
    fixture: GitFixture,
    refName: string,
): void {
    const secondClonePath = readSecondClonePath(fixture);
    git(secondClonePath, ['checkout', '-b', 'remote-hidden'], false);
    commitFile(
        secondClonePath,
        'remote-hidden.txt',
        'remote-hidden\n',
        'Create remote hidden history',
    );
    git(secondClonePath, ['push', 'origin', `HEAD:${refName}`], false);
}

function createMovedRemoteTagReflogHistoryNotOnBase(
    fixture: GitFixture,
    tagName: string,
): void {
    const secondClonePath = readSecondClonePath(fixture);
    git(secondClonePath, ['checkout', '-b', 'remote-tag-history'], false);
    commitFile(
        secondClonePath,
        'remote-tag-history.txt',
        'remote-tag-history\n',
        'Create remote tag-history work',
    );
    git(secondClonePath, ['tag', '-f', tagName, 'HEAD'], false);
    git(
        secondClonePath,
        ['push', '--force', 'origin', `refs/tags/${tagName}`],
        false,
    );
    git(secondClonePath, ['tag', '-f', tagName, 'origin/main'], false);
    git(
        secondClonePath,
        ['push', '--force', 'origin', `refs/tags/${tagName}`],
        false,
    );
}

function deleteRemoteBranchFromSecondClone(
    fixture: GitFixture,
    branchName: string,
): void {
    const secondClonePath = readSecondClonePath(fixture);
    git(secondClonePath, ['push', 'origin', `:${branchName}`], false);
}

function readSecondClonePath(fixture: GitFixture): string {
    const secondClonePath = path.join(fixture.tempPath, 'second-clone');

    if (!existsSync(secondClonePath)) {
        cloneFixtureRepository(
            fixture.tempPath,
            fixture.originPath,
            secondClonePath,
        );
    }

    return secondClonePath;
}

function createGraftIgnoredFeatureScenario(fixture: GitFixture): string {
    const graftFilePath = path.join(fixture.tempPath, 'grafts');

    git(fixture.repoPath, ['checkout', '-b', 'feature'], false);
    commitFile(
        fixture.repoPath,
        'feature.txt',
        'feature\n',
        'Create unmerged feature work',
    );
    git(fixture.repoPath, ['push', '-u', 'origin', 'feature'], false);
    const featureSha = readCurrentSha(fixture.repoPath, 'feature');
    git(fixture.repoPath, ['checkout', 'main'], false);
    commitFile(
        fixture.repoPath,
        'main-only.txt',
        'main-only\n',
        'Create main-only work',
    );
    git(fixture.repoPath, ['push', 'origin', 'main'], false);
    git(fixture.repoPath, ['fetch', 'origin'], false);
    writeFile(
        graftFilePath,
        `${readCurrentSha(fixture.repoPath, 'main')} ${featureSha}\n`,
    );

    return graftFilePath;
}

function installOriginMoveAfterLocalArchive(fixture: GitFixture): string {
    const secondClonePath = readSecondClonePath(fixture);

    git(secondClonePath, ['checkout', 'feature'], false);
    commitFile(
        secondClonePath,
        'mid-apply-drift.txt',
        'mid-apply-drift\n',
        'Create mid-apply remote drift',
    );
    installRemoteDriftOnLocalArchiveHook(fixture, secondClonePath, 'feature');

    return secondClonePath;
}

function createSha256PinnedRestoreFixture(): {
    archivedBranchName: string;
    movedArchiveSha: string;
    originalBranchSha: string;
    repoPath: string;
} {
    const tempPath = mkdtempSync(
        path.join(os.tmpdir(), 'slop-refinery-git-cleanup-sha256-'),
    );
    const repoPath = path.join(tempPath, 'repo');
    const archivedBranchName =
        'slop-refinery/archive/local/feature/manual-restore-sha256';

    temporaryPaths.push(tempPath);
    git(tempPath, ['init', '--object-format=sha256', repoPath], false);
    configureGitIdentity(repoPath);
    git(repoPath, ['checkout', '-b', 'main'], false);
    commitFile(repoPath, 'README.md', '# fixture\n', 'Initial commit');
    git(repoPath, ['branch', 'feature'], false);
    const originalBranchSha = readCurrentSha(repoPath, 'feature');
    const movedArchiveSha = createDeletedMovedBranch(repoPath);
    git(repoPath, ['branch', '-m', 'feature', archivedBranchName], false);
    git(repoPath, ['branch', '-f', archivedBranchName, movedArchiveSha], false);

    return { archivedBranchName, movedArchiveSha, originalBranchSha, repoPath };
}

function createDeletedMovedBranch(cwd: string): string {
    git(cwd, ['checkout', '-b', 'moved', 'main'], false);
    commitFile(cwd, 'moved.txt', 'moved\n', 'Create moved archive target');
    const movedArchiveSha = readCurrentSha(cwd, 'moved');
    git(cwd, ['checkout', 'main'], false);
    git(cwd, ['branch', '-D', 'moved'], false);

    return movedArchiveSha;
}

function expectRemoteDriftRestoredLocalBranch(
    fixture: GitFixture,
    secondClonePath: string,
    applyReport: GitCleanupReportType,
    applyResult:
        | NonNullable<GitCleanupReportType['applyResults']>[number]
        | undefined,
): void {
    expect(applyResult?.localBranchDeleted).toBe(false);
    expect(applyResult?.localBranchSkippedReason).toContain(
        'local branch name was restored',
    );
    expect(applyResult?.remoteBranchDeleted).toBe(false);
    expect(applyResult?.remoteBranchSkippedReason).toContain('moved');
    expect(
        findBranchReport(applyReport, 'safeDelete', 'feature'),
    ).toBeUndefined();
    expect(
        findBranchReport(applyReport, 'needsReview', 'feature')?.state
            .safeToDelete,
    ).toBe(false);
    expect(git(fixture.repoPath, ['branch', '--list', 'feature'])).toContain(
        'feature',
    );
    expect(
        findArchivedBranch(fixture.repoPath, 'local', 'feature'),
    ).not.toBeNull();
    expect(readCurrentSha(fixture.originPath, 'feature')).toBe(
        readCurrentSha(secondClonePath, 'feature'),
    );
}

afterEach(() => {
    while (temporaryPaths.length > 0) {
        const tempPath = temporaryPaths.pop();

        if (tempPath !== undefined && existsSync(tempPath)) {
            rmSync(tempPath, { force: true, recursive: true });
        }
    }
});

const gitCleanupIntegrationTimeoutMs = 20 * 60_000;
const gitCleanupLongIntegrationTimeoutMs = 30 * 60_000;

describe('git-cleanup CLI', () => {
    describe('human-readable output', () => {
        it(
            'ends human-readable audit output with a compact action summary',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createUnmergedRemoteBranch(fixture.repoPath, 'review');
                makeOriginAppearHosted(fixture);

                const result = runGitCleanup(fixture.repoPath, ['git-cleanup']);
                const expectedEnding = [
                    '## Action Summary',
                    '- Delete candidates: `feature`.',
                    '- To delete them: `slop-refinery git-cleanup --apply`.',
                    '- Manual review: `review`.',
                    '- Detached worktrees: none.',
                ].join('\n');

                expect(result.status).toBe(0);
                expect(result.output.endsWith(expectedEnding)).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('branch apply basics', () => {
        it(
            'marks a merged local branch safe_delete and prunes redundant archives after apply',
            () => {
                const { fixture, remoteFeatureSha } =
                    createAuditedSafeDeleteFeatureFixture();

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);

                expectApplyAndPruneReport(
                    applyReport,
                    fixture,
                    remoteFeatureSha,
                );
                expectFeatureArchivesPruned(fixture);
                expectNoPostApplyDeleteGuidance(applyReport, 'feature');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps archive refs after apply when requested',
            () => {
                const { fixture, remoteFeatureSha } =
                    createAuditedSafeDeleteFeatureFixture();

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                    '--keep-archives',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expectFeatureDeletedLocallyAndRemotely(
                    fixture,
                    applyResult,
                    remoteFeatureSha,
                );
                expect(applyReport.archivePruneResults).toBeUndefined();
                expectArchiveBranchesHiddenAfterPrune(fixture.repoPath);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('branch and remote classification', () => {
        describe('archive pruning', () => {
            it(
                'prunes redundant archive refs when run standalone',
                () => {
                    const { fixture, remoteFeatureSha } =
                        createAuditedSafeDeleteFeatureFixture();
                    const archiveRefs = applyFeatureAndReadArchiveRefs(
                        fixture,
                        remoteFeatureSha,
                    );
                    const pruneReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--prune-archives',
                    ]);

                    expect(pruneReport.mode).toBe('prune');
                    expectPrunedFeatureArchives(
                        pruneReport,
                        fixture,
                        archiveRefs,
                    );
                    expectFeatureArchivesPruned(fixture);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'can apply safe deletes and prune their archive refs in one run',
                () => {
                    const { fixture, remoteFeatureSha } =
                        createAuditedSafeDeleteFeatureFixture();

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                        '--prune-archives',
                    ]);

                    expectApplyAndPruneReport(
                        applyReport,
                        fixture,
                        remoteFeatureSha,
                    );
                    expectFeatureArchivesPruned(fixture);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'keeps archive refs whose tips are not on the canonical base',
                () => {
                    const fixture = createGitFixture();
                    const archivedBranchName =
                        'slop-refinery/archive/local/feature/manual-check';
                    const archivedRef = `refs/heads/${archivedBranchName}`;

                    createArchivedBranchRefNotOnBase(
                        fixture,
                        archivedBranchName,
                    );

                    const pruneReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--prune-archives',
                    ]);
                    const pruneResult = findArchivePruneResult(
                        pruneReport,
                        fixture.repoPath,
                        archivedRef,
                    );

                    expect(pruneReport.mode).toBe('prune');
                    expect(pruneResult?.pruned).toBe(false);
                    expect(pruneResult?.skippedReason).toContain(
                        'not reachable from the canonical base',
                    );
                    expect(
                        git(fixture.repoPath, [
                            'show-ref',
                            '--verify',
                            archivedRef,
                        ]),
                    ).not.toBe('');
                },
                gitCleanupIntegrationTimeoutMs,
            );
        });

        describe('final proof rechecks', () => {
            it(
                'keeps delete guidance when unrelated hidden refs appear during the final proof recheck',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const offBaseSha = createUnreferencedCommit(
                        fixture.repoPath,
                        'Create final proof drift',
                    );
                    const env = installHiddenRefBeforeSecondHiddenRefScan(
                        fixture,
                        'refs/original/final-proof-drift',
                        offBaseSha,
                    );

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );
                    expectSafeDeleteBranch(auditReport);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'removes delete guidance when origin HEAD changes during the final detached proof recheck',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    git(fixture.originPath, [
                        'branch',
                        'alternate-main',
                        'main',
                    ]);
                    const env =
                        installOriginHeadRepointBeforeFourthOriginHeadRead(
                            fixture,
                            'alternate-main',
                        );

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );
                    const reviewBranch = findBranchReport(
                        auditReport,
                        'needsReview',
                        'feature',
                    );

                    expect(reviewBranch?.classification).toBe('needs_review');
                    expect(reviewBranch?.state.safeToDelete).toBe(false);
                    expect(reviewBranch?.deleteCommands).toEqual([]);
                    expect(reviewBranch?.reasonDetails.join('\n')).toContain(
                        'origin/HEAD changed',
                    );
                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature'),
                    ).toBe(undefined);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'removes delete guidance when replace refs appear during the final proof recheck',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const featureSha = readCurrentSha(
                        fixture.repoPath,
                        'feature',
                    );
                    const mainSha = readCurrentSha(fixture.repoPath, 'main');
                    const env = installHiddenRefBeforeSecondHiddenRefScan(
                        fixture,
                        `refs/replace/${featureSha}`,
                        mainSha,
                    );

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );
                    const reviewBranch = findBranchReport(
                        auditReport,
                        'needsReview',
                        'feature',
                    );

                    expect(reviewBranch?.classification).toBe('needs_review');
                    expect(reviewBranch?.state.safeToDelete).toBe(false);
                    expect(reviewBranch?.deleteCommands).toEqual([]);
                    expect(reviewBranch?.reasonDetails.join('\n')).toContain(
                        'refs/replace',
                    );
                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature'),
                    ).toBe(undefined);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'keeps delete guidance when replace refs do not appear until after the branch proof recheck',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const mainSha = readCurrentSha(fixture.repoPath, 'main');
                    const env =
                        installReplaceRefBeforeNthLocalRewriteOverlayCheck(
                            fixture,
                            mainSha,
                            mainSha,
                            3,
                        );

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );

                    expectSafeDeleteBranch(auditReport);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'keeps delete guidance when hidden refs appear during the final repository proof recheck',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const env = installGeneratedHiddenRefBeforeNthHiddenRefScan(
                        fixture,
                        'refs/original/late-hidden',
                        10,
                    );

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );
                    expectSafeDeleteBranch(auditReport);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'keeps delete guidance when a detached worktree appears during the final proof recheck',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const env =
                        installDetachedWorktreeBeforeThirdWorktreeList(fixture);

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );
                    const safeDeleteBranch =
                        expectSafeDeleteBranch(auditReport);

                    expect(safeDeleteBranch.deleteCommands).toEqual(
                        expect.arrayContaining([
                            expect.stringContaining('git-cleanup --apply'),
                        ]),
                    );
                    expect(
                        auditReport.detachedWorktrees.some(
                            (worktree) => !worktree.state.safeToRemoveManually,
                        ),
                    ).toBe(true);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'keeps delete guidance when a final detached worktree has private refs outside main',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const env =
                        installDetachedWorktreePrivateRefBeforeFinalWorktreeList(
                            fixture,
                        );

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );
                    const safeDeleteBranch =
                        expectSafeDeleteBranch(auditReport);

                    expect(safeDeleteBranch.deleteCommands).toEqual(
                        expect.arrayContaining([
                            expect.stringContaining('git-cleanup --apply'),
                        ]),
                    );
                    expect(
                        auditReport.detachedWorktrees.some((worktree) =>
                            worktree.state.repositoryHiddenRefs.some((ref) =>
                                ref.includes('refs/worktree/final-private'),
                            ),
                        ),
                    ).toBe(true);
                },
                gitCleanupIntegrationTimeoutMs,
            );
        });

        it(
            'ignores caller-provided graft files when proving safe_delete',
            () => {
                const fixture = createGitFixture();
                const graftFilePath =
                    createGraftIgnoredFeatureScenario(fixture);

                const auditReport = runGitCleanupJson(
                    fixture.repoPath,
                    ['git-cleanup'],
                    {
                        GIT_GRAFT_FILE: graftFilePath,
                    },
                );

                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
                expect(
                    findBranchReport(auditReport, 'needsReview', 'feature')
                        ?.reasonCodes,
                ).toContain('branch_tip_not_on_base');
                expect(
                    findBranchReport(auditReport, 'needsReview', 'feature')
                        ?.deleteCommands,
                ).toEqual([]);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed on symbolic local branch refs',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.repoPath,
                    ['symbolic-ref', 'refs/heads/feature', 'refs/heads/main'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);

                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
                expect(
                    findBranchReport(auditReport, 'needsReview', 'feature')
                        ?.reasonCodes,
                ).toContain('branch_reflog_unavailable');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        describe('apply revalidation', () => {
            it(
                'fails closed when the origin branch moves after audit but before apply',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    advanceRemoteBranchFromSecondClone(fixture, 'feature');

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');
                    const reviewBranch = findBranchReport(
                        applyReport,
                        'needsReview',
                        'feature',
                    );

                    expect(applyResult).toBeUndefined();
                    expect(reviewBranch?.reasonCodes).toContain(
                        'origin_branch_live_tip_unverified',
                    );
                    expect(
                        git(fixture.repoPath, ['branch', '--list', 'feature']),
                    ).toContain('feature');
                    expect(
                        git(fixture.repoPath, [
                            'ls-remote',
                            'origin',
                            'refs/heads/feature',
                        ]),
                    ).not.toBe('');
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'fails closed when origin HEAD repoints to an alternate branch during apply revalidation',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    git(fixture.originPath, [
                        'branch',
                        'alternate-main',
                        'main',
                    ]);
                    git(fixture.repoPath, [
                        'fetch',
                        'origin',
                        'alternate-main',
                    ]);
                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    const applyReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup', '--apply'],
                        installOriginHeadRepointBeforeNthOriginHeadRead(
                            fixture,
                            'alternate-main',
                            5,
                        ),
                    );
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expect(applyResult?.localBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchDeleted).toBe(false);
                    expect(applyResult?.errors.join('\n')).toContain(
                        'origin/HEAD changed',
                    );
                    expect(
                        git(fixture.repoPath, ['branch', '--list', 'feature']),
                    ).toContain('feature');
                    expect(
                        git(fixture.repoPath, [
                            'ls-remote',
                            'origin',
                            'refs/heads/feature',
                        ]),
                    ).not.toBe('');
                },
                gitCleanupIntegrationTimeoutMs,
            );
            it(
                'restores the local branch if origin moves after the local branch is archived',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const secondClonePath =
                        installOriginMoveAfterLocalArchive(fixture);
                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expectRemoteDriftRestoredLocalBranch(
                        fixture,
                        secondClonePath,
                        applyReport,
                        applyResult,
                    );
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'restores the local branch if the remote safety proof changes after the local archive',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const remoteFeatureSha = readCurrentSha(
                        fixture.originPath,
                        'feature',
                    );
                    installRemoteReflogMutationOnLocalArchiveHook(
                        fixture,
                        'feature',
                        remoteFeatureSha,
                    );

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expect(applyResult?.localBranchDeleted).toBe(false);
                    expect(applyResult?.localBackupRef).not.toBeNull();
                    expect(applyResult?.localBranchSkippedReason).toContain(
                        'local branch name was restored',
                    );
                    expect(applyResult?.remoteBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchSkippedReason).toContain(
                        'remote safety proof',
                    );
                    expect(
                        git(fixture.repoPath, ['branch', '--list', 'feature']),
                    ).toContain('feature');
                    expect(
                        git(fixture.repoPath, [
                            'ls-remote',
                            'origin',
                            'refs/heads/feature',
                        ]),
                    ).not.toBe('');
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'restores the local branch if the remote proof changes during the remote archive',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    installLocalTrackingRefMutationOnRemoteArchiveHook(
                        fixture,
                        'feature',
                    );

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expect(applyResult?.localBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchDeleted).toBe(false);
                    expect(applyResult?.localBranchSkippedReason).toContain(
                        'remote branch was not archived after the local archive',
                    );
                    expect(applyResult?.remoteBranchSkippedReason).toContain(
                        'local tracking ref for origin/feature changed',
                    );
                    expect(
                        git(fixture.repoPath, ['branch', '--list', 'feature']),
                    ).toContain('feature');
                    expect(
                        git(fixture.repoPath, [
                            'ls-remote',
                            'origin',
                            'refs/heads/feature',
                        ]),
                    ).not.toBe('');
                    expect(
                        findBranchReport(applyReport, 'safeDelete', 'feature'),
                    ).toBeUndefined();
                    expect(
                        findBranchReport(applyReport, 'needsReview', 'feature')
                            ?.state.safeToDelete,
                    ).toBe(false);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'restores the local branch if an absent origin branch reappears before final reporting',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    deleteOriginBranchButPreserveReflog(fixture, 'feature');
                    const env =
                        installRemoteBranchRecreateBeforeFinalAbsentProbe(
                            fixture,
                            'feature',
                        );

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    const applyReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup', '--apply'],
                        env,
                    );
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expect(applyResult?.localBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchDeleted).toBe(false);
                    expect(applyResult?.localBranchSkippedReason).toContain(
                        'final absent remote proof revalidation failed',
                    );
                    expect(
                        git(fixture.repoPath, ['branch', '--list', 'feature']),
                    ).toContain('feature');
                    expect(
                        git(fixture.repoPath, [
                            'ls-remote',
                            'origin',
                            'refs/heads/feature',
                        ]),
                    ).not.toBe('');
                    expect(
                        findBranchReport(applyReport, 'safeDelete', 'feature'),
                    ).toBeUndefined();
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'restores the remote branch if the local archive disappears during remote archive',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    installLocalArchiveDeletionOnRemoteArchiveHook(
                        fixture,
                        'feature',
                    );

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expect(applyResult?.localBranchDeleted).toBe(false);
                    expect(applyResult?.localBackupRef).toBe(null);
                    expect(applyResult?.remoteBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchSkippedReason).toContain(
                        'local branch archive ref could not be revalidated',
                    );
                    expect(
                        git(fixture.originPath, [
                            'branch',
                            '--list',
                            'feature',
                        ]),
                    ).toContain('feature');
                    expect(
                        findArchivedBranch(
                            fixture.originPath,
                            'remote',
                            'feature',
                        ),
                    ).not.toBeNull();
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'does not report deletion after the local archive is checked out during remote archive',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    installLocalArchiveCheckoutOnRemoteArchiveHook(
                        fixture,
                        'feature',
                    );

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature')
                            ?.classification,
                    ).toBe('safe_delete');

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expect(applyResult?.localBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchDeleted).toBe(false);
                    expect(
                        [
                            ...(applyResult?.errors ?? []),
                            applyResult?.localBranchSkippedReason,
                            applyResult?.remoteBranchSkippedReason,
                        ].join('\n'),
                    ).toContain('worktree');
                    expect(
                        git(fixture.repoPath, ['branch', '--show-current']),
                    ).toContain('slop-refinery/archive/local/feature');
                },
                gitCleanupIntegrationTimeoutMs,
            );
        });

        it(
            'keeps branch deletion when an unrelated dirty worktree appears after local archive',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                installDirtyWorktreeOnLocalArchiveHook(fixture);
                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);

                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature')
                        ?.classification,
                ).toBe('safe_delete');

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.localBranchDeleted).toBe(true);
                expect(applyResult?.remoteBranchDeleted).toBe(true);
                expect(applyResult?.localBranchSkippedReason).toBeNull();
                expect(
                    git(fixture.repoPath, ['branch', '--list', 'feature']),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'reports a preserved local backup ref if apply throws after local restore',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const featureSha = readCurrentSha(fixture.repoPath, 'feature');
                installDirtyWorktreeAndGraftOnLocalArchiveHook(fixture);

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);

                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature')
                        ?.classification,
                ).toBe('safe_delete');

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expectLocalArchiveRestorePreservedBackup(
                    fixture,
                    featureSha,
                    applyResult,
                );
                expect(applyResult?.errors.join('\n')).toContain(
                    'grafts exists',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores both branch names if apply throws after remote archive',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const env = installExistsSyncFailureAfterRemoteArchive(fixture);

                const applyReport = runGitCleanupJson(
                    fixture.repoPath,
                    ['git-cleanup', '--apply'],
                    env,
                );
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.localBranchDeleted).toBe(false);
                expect(applyResult?.remoteBranchDeleted).toBe(false);
                expect(applyResult?.errors.join('\n')).toContain(
                    'forced post-remote archive existsSync failure',
                );
                expect(applyResult?.localBranchSkippedReason).toContain(
                    'local branch name was restored',
                );
                expect(applyResult?.remoteBranchSkippedReason).toContain(
                    'original remote branch name was restored',
                );
                expect(
                    git(fixture.repoPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores both branch names if final result validation sees origin HEAD drift',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(fixture.originPath, ['branch', 'alternate-main', 'main']);
                const env =
                    installOriginHeadRepointBeforeNthArchivedOriginHeadRead(
                        fixture,
                        'alternate-main',
                        5,
                    );

                const applyReport = runGitCleanupJson(
                    fixture.repoPath,
                    ['git-cleanup', '--apply'],
                    env,
                );
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.localBranchDeleted).toBe(false);
                expect(applyResult?.remoteBranchDeleted).toBe(false);
                expect(applyResult?.errors.join('\n')).toContain(
                    'origin/HEAD changed',
                );
                expect(applyResult?.localBranchSkippedReason).toContain(
                    'local branch name was restored',
                );
                expect(applyResult?.remoteBranchSkippedReason).toContain(
                    'original remote branch name was restored',
                );
                expect(
                    git(fixture.repoPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps a no-upstream branch in review when the same-name origin branch moved beyond main',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                unsetUpstreamAndDeleteTracking(fixture.repoPath, 'feature');
                advanceRemoteBranchFromSecondClone(fixture, 'feature');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_live_tip_unverified',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'marks a merged same-name origin branch safe even when no upstream is configured',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.repoPath,
                    ['branch', '--unset-upstream', 'feature'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.remoteBranch?.shortName).toBe(
                    'origin/feature',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'applies cleanup for a merged same-name origin branch when no upstream is configured',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const remoteFeatureSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                git(
                    fixture.repoPath,
                    ['branch', '--unset-upstream', 'feature'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.remoteBranch?.remoteSafetyProofFingerprint,
                ).not.toBeNull();

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                    '--keep-archives',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expectFeatureDeletedLocallyAndRemotely(
                    fixture,
                    applyResult,
                    remoteFeatureSha,
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'marks a no-upstream merged branch safe when the same-name origin branch is already absent',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createForcePushedRemoteHistoryNotOnBase(fixture, 'feature');
                deleteRemoteBranchFromSecondClone(fixture, 'feature');
                unsetUpstreamAndDeleteTracking(fixture.repoPath, 'feature');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.remoteBranch?.status).toBe('absent');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'marks a local-only merged branch safe when no same-name origin branch exists',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.remoteBranch?.status).toBe('absent');
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('randomized safe-delete invariant stress', () => {
        for (const scenario of buildGitCleanupStressScenarios()) {
            it(
                `preserves the safe_delete invariant for seed ${scenario.seed} (${scenario.localMode}/${scenario.remoteMode})`,
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    applyGitCleanupStressScenario(fixture, scenario);

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expectGitCleanupStressInvariant(auditReport, scenario);
                },
                gitCleanupIntegrationTimeoutMs,
            );
        }
    });

    describe('branch and remote classification tracking safety', () => {
        it(
            'keeps branches in review when the tracked origin branch name does not match the local branch name',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushAsBranch: 'shared-feature',
                    pushRemote: true,
                });

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_delete_target_mismatch',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps branches in review when a deleted mismatched upstream is absent',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushAsBranch: 'shared-feature',
                    pushRemote: true,
                });
                git(
                    fixture.repoPath,
                    ['push', 'origin', 'main:feature'],
                    false,
                );
                rmSync(
                    path.join(
                        fixture.originPath,
                        'refs',
                        'heads',
                        'shared-feature',
                    ),
                    { force: true },
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.remoteBranch?.status).toBe('absent');
                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_delete_target_mismatch',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'does not mistake an origin-prefixed remote name for canonical origin',
            () => {
                const fixture = createOriginPrefixedRemoteNameFixture();

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);

                expectOriginPrefixedRemoteNeedsReview(auditReport);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when unrelated unreachable objects exist',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createUnreachableBlob(fixture.repoPath);

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryUnreachableCommitCount,
                ).toBeGreaterThan(0);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when unrelated hidden local refs point outside main',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createHiddenLocalRefNotOnBase(
                    fixture.repoPath,
                    'refs/original/hidden-history',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.state.repositoryHiddenRefs).toContain(
                    'refs/original/hidden-history',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when unrelated non-commit refs exist',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createHiddenNonCommitRefNotOnBase(
                    fixture,
                    'refs/slop-refinery/blob-snapshot',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.state.repositoryHiddenRefs).toContain(
                    'refs/slop-refinery/blob-snapshot',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when an unrelated annotated tag object is retained',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                git(
                    fixture.repoPath,
                    [
                        'tag',
                        '-a',
                        'retained-main-tag-object',
                        '-m',
                        'Retain annotated tag object',
                        'main',
                    ],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryHiddenRefCount,
                ).toBeGreaterThan(0);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('branch and remote classification retained ref safety', () => {
        it(
            'still marks a safe branch deleteable when prior backup tags point outside main',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createHiddenLocalRefNotOnBase(
                    fixture.repoPath,
                    'refs/tags/slop-refinery/git-cleanup/manual-backup',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.state.repositoryHiddenRefs).toContain(
                    'refs/tags/slop-refinery/git-cleanup/manual-backup',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when an earlier off-base archive branch exists',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createArchivedBranchRefNotOnBase(
                    fixture,
                    'slop-refinery/archive/local/off-base/manual-check',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.state.repositoryHiddenRefs).toContain(
                    'refs/heads/slop-refinery/archive/local/off-base/manual-check',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps protected main in review when its origin tracking proof is incomplete',
            () => {
                const fixture = createGitFixture();

                createArchivedBranchRefNotOnBase(
                    fixture,
                    'slop-refinery/archive/local/off-base/manual-check',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'main',
                );

                expect(reviewBranch?.remoteBranch?.status).toBe(
                    'history_unverified',
                );
                expect(
                    auditReport.branches.skipped.some(
                        (branch) => branch.name === 'main',
                    ),
                ).toBe(false);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps protected main in review when it is checked out in a dirty primary worktree',
            () => {
                const fixture = createGitFixture();

                writeFile(
                    path.join(fixture.repoPath, 'dirty-main.txt'),
                    'dirty\n',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'main',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'linked_worktree_dirty',
                );
                expect(
                    auditReport.branches.skipped.some(
                        (branch) => branch.name === 'main',
                    ),
                ).toBe(false);
            },
            gitCleanupIntegrationTimeoutMs,
        );
        it(
            'keeps detached worktrees in review when a sibling worktree is dirty',
            () => {
                const fixture = createGitFixture();
                const detachedWorktreePath = path.join(
                    fixture.tempPath,
                    'clean-detached-worktree',
                );

                git(
                    fixture.repoPath,
                    [
                        'worktree',
                        'add',
                        '--detach',
                        detachedWorktreePath,
                        'main',
                    ],
                    false,
                );
                writeFile(
                    path.join(fixture.repoPath, 'dirty-main.txt'),
                    'dirty\n',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const [detachedWorktree] = auditReport.detachedWorktrees;

                expect(detachedWorktree?.state.safeToRemoveManually).toBe(
                    false,
                );
                expect(
                    detachedWorktree?.state.repositoryWorktreeDirtyCount,
                ).toBe(1);
                expect(detachedWorktree?.reasonCodes).toContain(
                    'repository_worktree_dirty',
                );
                expect(detachedWorktree?.opinion.code).toBe(
                    'needs_human_review',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'refuses to run from a linked worktree when grafts are active in the shared git dir',
            () => {
                const fixture = createGitFixture();
                const linkedWorktreePath = path.join(
                    fixture.tempPath,
                    'main-worktree',
                );

                git(
                    fixture.repoPath,
                    ['worktree', 'add', '--detach', linkedWorktreePath, 'main'],
                    false,
                );
                writeFile(
                    path.join(
                        readGitCommonDir(linkedWorktreePath),
                        'info',
                        'grafts',
                    ),
                    'deadbeef deadbeef\n',
                );

                const result = runGitCleanup(linkedWorktreePath, [
                    'git-cleanup',
                    '--json',
                ]);

                expect(result.status).toBe(1);
                expect(result.output).toContain('grafts');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps branches in review when the remote branch is gone but its stale local tracking ref is still outside main',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createStaleTrackingRefNotOnBase(fixture, 'feature');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_tracking_ref_not_on_base',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a local origin-tracking ref is symbolic',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.repoPath,
                    [
                        'symbolic-ref',
                        'refs/remotes/origin/feature',
                        'refs/remotes/origin/main',
                    ],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_identity_unverified',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBeUndefined();
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a local origin-tracking reflog is missing',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                rmSync(
                    path.join(
                        readGitCommonDir(fixture.repoPath),
                        'logs',
                        'refs',
                        'remotes',
                        'origin',
                        'feature',
                    ),
                    { force: true },
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_unverified',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBeUndefined();
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'marks a merged branch safe when the live origin branch is gone and tracking was pruned',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createForcePushedRemoteHistoryNotOnBase(fixture, 'feature');
                deleteRemoteBranchFromSecondClone(fixture, 'feature');
                git(fixture.repoPath, ['fetch', 'origin', '--prune'], false);

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.remoteBranch?.status).toBe('absent');
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('local worktree safety', () => {
        it(
            'still marks a safe branch deleteable when an unrelated repository worktree is dirty',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                writeFile(
                    path.join(fixture.repoPath, 'dirty-main.txt'),
                    'dirty\n',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryWorktreeDirtyCount,
                ).toBe(1);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a branch reflog still points at a local-only commit',
            () => {
                const fixture = createGitFixture();

                git(fixture.repoPath, ['checkout', '-b', 'feature'], false);
                commitFile(
                    fixture.repoPath,
                    'feature.txt',
                    'feature\n',
                    'Create feature work',
                );
                git(fixture.repoPath, ['checkout', 'main'], false);
                git(
                    fixture.repoPath,
                    ['branch', '-f', 'feature', 'main'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'branch_reflog_has_unique_commits',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a branch reflog contains a malformed entry',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                writeFileSync(
                    path.join(
                        readGitCommonDir(fixture.repoPath),
                        'logs',
                        'refs',
                        'heads',
                        'feature',
                    ),
                    'notasha also-notasha corrupt\n',
                    { flag: 'a' },
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'branch_reflog_unavailable',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBeUndefined();
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when unrelated repository-wide reflogs retain non-base history',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createMovedTagReflogHistoryNotOnBase(
                    fixture.repoPath,
                    'retained-history',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryReflogUniqueCommitCount,
                ).toBeGreaterThan(0);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when an unrelated linked worktree HEAD reflog retains non-base history',
            () => {
                const fixture = createGitFixture();
                const linkedWorktreePath = path.join(
                    fixture.tempPath,
                    'topic-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createAttachedLinkedWorktreeWithDetachedHeadHistory(
                    fixture,
                    'topic',
                    linkedWorktreePath,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryReflogUniqueCommitCount,
                ).toBeGreaterThan(0);
                expect(
                    safeDeleteBranch.state.repositoryLinkedWorktreePaths,
                ).toContain(realpathSync(linkedWorktreePath));
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when an unrelated dirty linked worktree path contains a newline',
            () => {
                const fixture = createGitFixture();
                const cleanSiblingPath = path.join(
                    fixture.tempPath,
                    'newline-worktree',
                );
                const newlineWorktreePath = `${cleanSiblingPath}\nspoof`;

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                git(fixture.repoPath, ['branch', 'clean-topic', 'main'], false);
                git(fixture.repoPath, ['branch', 'dirty-topic', 'main'], false);
                git(
                    fixture.repoPath,
                    ['worktree', 'add', cleanSiblingPath, 'clean-topic'],
                    false,
                );
                git(
                    fixture.repoPath,
                    ['worktree', 'add', newlineWorktreePath, 'dirty-topic'],
                    false,
                );
                writeFile(
                    path.join(newlineWorktreePath, 'untracked.txt'),
                    'dirty\n',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryWorktreeDirtyPaths.some(
                        (dirtyPath) => dirtyPath.includes('\nspoof'),
                    ),
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when an unrelated worktree-private ref points outside main',
            () => {
                const fixture = createGitFixture();
                const linkedWorktreePath = path.join(
                    fixture.tempPath,
                    'private-ref-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                git(fixture.repoPath, ['branch', 'topic', 'main'], false);
                git(
                    fixture.repoPath,
                    ['worktree', 'add', linkedWorktreePath, 'topic'],
                    false,
                );
                git(linkedWorktreePath, ['checkout', '--detach'], false);
                commitFile(
                    linkedWorktreePath,
                    'private-ref.txt',
                    'private-ref\n',
                    'Create private ref work',
                );
                git(
                    linkedWorktreePath,
                    ['update-ref', 'refs/worktree/private-ref', 'HEAD'],
                    false,
                );
                git(linkedWorktreePath, ['checkout', 'topic'], false);
                rmSync(
                    path.join(
                        readAbsoluteGitDir(linkedWorktreePath),
                        'logs',
                        'HEAD',
                    ),
                    { force: true },
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryHiddenRefs.some((ref) =>
                        ref.endsWith('/refs/worktree/private-ref'),
                    ),
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when an unrelated worktree-private ref reflog retains history outside main',
            () => {
                const fixture = createGitFixture();
                const linkedWorktreePath = path.join(
                    fixture.tempPath,
                    'private-reflog-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                git(fixture.repoPath, ['branch', 'topic', 'main'], false);
                git(
                    fixture.repoPath,
                    ['worktree', 'add', linkedWorktreePath, 'topic'],
                    false,
                );
                git(linkedWorktreePath, ['checkout', '--detach'], false);
                commitFile(
                    linkedWorktreePath,
                    'private-reflog.txt',
                    'private-reflog\n',
                    'Create private reflog work',
                );
                git(
                    linkedWorktreePath,
                    [
                        'update-ref',
                        '--create-reflog',
                        'refs/worktree/private-reflog',
                        'HEAD',
                    ],
                    false,
                );
                git(
                    linkedWorktreePath,
                    ['update-ref', 'refs/worktree/private-reflog', 'topic'],
                    false,
                );
                git(linkedWorktreePath, ['checkout', 'topic'], false);
                rmSync(
                    path.join(
                        readAbsoluteGitDir(linkedWorktreePath),
                        'logs',
                        'HEAD',
                    ),
                    { force: true },
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryReflogUniqueCommitCount,
                ).toBeGreaterThan(0);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'still marks a safe branch deleteable when another live off-base branch has no reflog',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                git(fixture.repoPath, ['checkout', '-b', 'topic'], false);
                commitFile(
                    fixture.repoPath,
                    'topic.txt',
                    'topic\n',
                    'Create topic work',
                );
                git(fixture.repoPath, ['checkout', 'main'], false);
                removeRefReflog(fixture.repoPath, 'refs', 'heads', 'topic');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.state.repositoryHiddenRefs).toContain(
                    'refs/heads/topic',
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when archived local branch validation loses the preserving reflog',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-check';

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                removeRefReflog(
                    fixture.repoPath,
                    'refs',
                    'heads',
                    ...archivedBranchName.split('/'),
                );

                const archivedBranchValidation =
                    validateArchivedBranchForTesting(
                        fixture.repoPath,
                        'feature',
                        archivedBranchName,
                        readCurrentSha(fixture.repoPath, archivedBranchName),
                    );

                expect(archivedBranchValidation.archived).toBe(false);
                expect(
                    archivedBranchValidation.errors.some((error) =>
                        error.includes('reflog'),
                    ),
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when archived local branch validation sees a symbolic archive ref',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-symbolic-check';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const expectedBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                git(fixture.repoPath, ['branch', '-D', 'feature'], false);
                git(
                    fixture.repoPath,
                    [
                        'symbolic-ref',
                        `refs/heads/${archivedBranchName}`,
                        'refs/heads/main',
                    ],
                    false,
                );

                const archivedBranchValidation =
                    validateArchivedBranchForTesting(
                        fixture.repoPath,
                        'feature',
                        archivedBranchName,
                        expectedBranchSha,
                    );

                expect(archivedBranchValidation.archived).toBe(false);
                expect(
                    archivedBranchValidation.errors.some((error) =>
                        error.includes('symbolic'),
                    ),
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when archived local branch validation sees a symbolic original ref',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-original-symbolic-check';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const expectedBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                git(
                    fixture.repoPath,
                    [
                        'symbolic-ref',
                        'refs/heads/feature',
                        'refs/heads/missing-target',
                    ],
                    false,
                );

                const archivedBranchValidation =
                    validateArchivedBranchForTesting(
                        fixture.repoPath,
                        'feature',
                        archivedBranchName,
                        expectedBranchSha,
                    );

                expect(archivedBranchValidation.archived).toBe(false);
                expect(
                    archivedBranchValidation.errors.some((error) =>
                        error.includes('symbolic'),
                    ),
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the original local branch name from the current archived tip',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-restore';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                );

                expect(restoreResult.restored).toBe(true);
                expect(restoreResult.errors).toEqual([]);
                expect(
                    git(fixture.repoPath, ['branch', '--list', 'feature']),
                ).toContain('feature');
                expect(
                    git(fixture.repoPath, [
                        'branch',
                        '--list',
                        archivedBranchName,
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the original local branch name from the current archived tip if the archive ref moved',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-restore-moved';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createHiddenLocalRefNotOnBase(
                    fixture.repoPath,
                    'refs/original/local-restore-moved',
                );
                const movedArchiveSha = readCurrentSha(
                    fixture.repoPath,
                    'refs/original/local-restore-moved',
                );

                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                git(
                    fixture.repoPath,
                    ['branch', '-f', archivedBranchName, movedArchiveSha],
                    false,
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                );

                expect(restoreResult.restored).toBe(true);
                expect(restoreResult.errors).toEqual([]);
                expect(readCurrentSha(fixture.repoPath, 'feature')).toBe(
                    movedArchiveSha,
                );
                expect(
                    git(fixture.repoPath, [
                        'branch',
                        '--list',
                        archivedBranchName,
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores a pinned branch at the expected SHA and preserves a moved archive ref',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-restore-pinned-moved';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const originalBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                createHiddenLocalRefNotOnBase(
                    fixture.repoPath,
                    'refs/original/local-restore-pinned-moved',
                );
                const movedArchiveSha = readCurrentSha(
                    fixture.repoPath,
                    'refs/original/local-restore-pinned-moved',
                );

                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                git(
                    fixture.repoPath,
                    ['branch', '-f', archivedBranchName, movedArchiveSha],
                    false,
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                    originalBranchSha,
                );

                expect(restoreResult.restored).toBe(true);
                expect(restoreResult.preservedArchiveRef).toBe(true);
                expect(restoreResult.errors).toEqual([]);
                expect(readCurrentSha(fixture.repoPath, 'feature')).toBe(
                    originalBranchSha,
                );
                expect(
                    readCurrentSha(fixture.repoPath, archivedBranchName),
                ).toBe(movedArchiveSha);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('local worktree environment safety', () => {
        it(
            'ignores inherited GIT_INDEX_FILE while leaving unrelated dirty state non-blocking',
            () => {
                const fixture = createGitFixture();
                const alternateIndexPath = path.join(
                    fixture.tempPath,
                    'clean-alternate-index',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createRealIndexOnlyReadmeChange(
                    fixture.repoPath,
                    alternateIndexPath,
                );

                const auditReport = runGitCleanupJson(
                    fixture.repoPath,
                    ['git-cleanup'],
                    { GIT_INDEX_FILE: alternateIndexPath },
                );
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryWorktreeDirtyCount,
                ).toBe(1);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it.each([
            'HEAD.lock',
            'index.lock',
            'packed-refs.lock',
            'refs/heads/feature.lock',
        ])(
            'keeps an otherwise safe branch deleteable when an unrelated repository worktree has a Git lock: %s',
            (lockRelativePath) => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const lockPath = path.join(
                    readAbsoluteGitDir(fixture.repoPath),
                    lockRelativePath,
                );

                mkdirSync(path.dirname(lockPath), { recursive: true });
                writeFile(lockPath, '');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryWorktreeDirtyCount,
                ).toBe(1);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps an otherwise safe branch deleteable when a tracked gitlink is present without gitmodules',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createTrackedGitlinkWithoutGitmodules(fixture.repoPath);
                git(fixture.repoPath, ['push', 'origin', 'main'], false);

                expect(git(fixture.repoPath, ['status', '--porcelain'])).toBe(
                    '',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(
                    safeDeleteBranch.state.repositoryWorktreeDirtyCount,
                ).toBe(1);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('local archive and restore safety', () => {
        it(
            'restores the remote branch if the local branch is recreated during remote archive',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                installLocalBranchRecreationOnRemoteArchiveHook(
                    fixture,
                    'feature',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);

                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature')
                        ?.classification,
                ).toBe('safe_delete');

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.localBranchDeleted).toBe(false);
                expect(applyResult?.remoteBranchDeleted).toBe(false);
                expect(applyResult?.remoteBranchSkippedReason).toContain(
                    'local branch name was recreated after the archive',
                );
                expect(
                    git(fixture.repoPath, ['branch', '--list', 'feature']),
                ).toContain('feature');
                expect(
                    git(fixture.originPath, ['branch', '--list', 'feature']),
                ).toContain('feature');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'skips remote deletion when the local archive disappears before validation',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                installLocalArchiveDeletionHook(fixture, 'feature');

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.localBranchDeleted).toBe(false);
                expect(applyResult?.localBackupRef).toBe(null);
                expect(applyResult?.localBranchSkippedReason).toContain(
                    'could not restore',
                );
                expect(applyResult?.remoteBranchDeleted).toBe(false);
                expect(applyResult?.remoteBackupRef).toBe(null);
                expect(applyResult?.remoteBranchSkippedReason).toContain(
                    'local branch archive recorded errors',
                );
                expect(readCurrentSha(fixture.originPath, 'feature')).toBe(
                    readCurrentSha(fixture.repoPath, 'origin/feature'),
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the local branch when the archive reflog is replaced after rename',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                installArchiveReflogReplacementHook(
                    fixture.repoPath,
                    fixture.tempPath,
                    'local',
                    'feature',
                );

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.localBranchDeleted).toBe(false);
                expect(applyResult?.localBackupRef).toBe(null);
                expect(applyResult?.localBranchSkippedReason).toContain(
                    'did not validate',
                );
                expect(applyResult?.errors.join('\n')).toContain(
                    'reflog did not preserve',
                );
                expect(
                    git(fixture.repoPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the local branch when the archive reflog gains an unsafe suffix after rename',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const featureSha = readCurrentSha(fixture.repoPath, 'feature');
                const initialSha = git(fixture.repoPath, [
                    'rev-list',
                    '--max-parents=0',
                    'main',
                ]);
                installArchiveReflogAppendHook(
                    fixture.repoPath,
                    fixture.tempPath,
                    'local',
                    'feature',
                    featureSha,
                    initialSha,
                );

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.localBranchDeleted).toBe(false);
                expect(applyResult?.localBackupRef).toBe(null);
                expect(applyResult?.localBranchSkippedReason).toContain(
                    'did not validate',
                );
                expect(applyResult?.errors.join('\n')).toContain(
                    'unexpected entries',
                );
                expect(
                    git(fixture.repoPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'preserves archive reflog bytes that are not valid utf8',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-byte-reflog';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const expectedBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                const sourceReflogPath = path.join(
                    readGitCommonDir(fixture.repoPath),
                    'logs',
                    'refs',
                    'heads',
                    'feature',
                );
                const sourceReflog = readFileSync(sourceReflogPath);
                const byteUnsafeReflog = Buffer.concat([
                    sourceReflog.subarray(0, sourceReflog.length - 1),
                    Buffer.from([0xff, 0x0a]),
                ]);

                writeFileSync(sourceReflogPath, byteUnsafeReflog);

                const archiveResult = archiveBranchRefTransactionForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                    expectedBranchSha,
                );
                const archivedReflog = readFileSync(
                    path.join(
                        readGitCommonDir(fixture.repoPath),
                        'logs',
                        'refs',
                        'heads',
                        ...archivedBranchName.split('/'),
                    ),
                );

                expect(archiveResult.ok).toBe(true);
                expect(
                    archivedReflog
                        .subarray(0, byteUnsafeReflog.length)
                        .equals(byteUnsafeReflog),
                ).toBe(true);
                expect(
                    validateArchivedBranchForTesting(
                        fixture.repoPath,
                        'feature',
                        archivedBranchName,
                        expectedBranchSha,
                        byteUnsafeReflog.toString('latin1'),
                    ).archived,
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'aborts local archive when the branch reflog changes after pinning',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-reflog-race';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const expectedBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                const pinnedSourceReflog = readFileSync(
                    path.join(
                        readGitCommonDir(fixture.repoPath),
                        'logs',
                        'refs',
                        'heads',
                        'feature',
                    ),
                ).toString('latin1');
                const offBaseSha = createUnreferencedCommit(
                    fixture.repoPath,
                    'Create transient reflog-only work',
                );

                git(fixture.repoPath, [
                    'update-ref',
                    'refs/heads/feature',
                    offBaseSha,
                    expectedBranchSha,
                ]);
                git(fixture.repoPath, [
                    'update-ref',
                    'refs/heads/feature',
                    expectedBranchSha,
                    offBaseSha,
                ]);

                const archiveResult = archiveBranchRefTransactionForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                    expectedBranchSha,
                    [],
                    pinnedSourceReflog,
                );

                expect(archiveResult.ok).toBe(false);
                if (archiveResult.ok) {
                    throw new Error('Expected archive transaction to fail.');
                }
                expect(archiveResult.error).toContain('reflog changed');
                expect(readCurrentSha(fixture.repoPath, 'feature')).toBe(
                    expectedBranchSha,
                );
                expect(
                    git(fixture.repoPath, [
                        'for-each-ref',
                        `refs/heads/${archivedBranchName}`,
                        '--format=%(refname:short)',
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps the local branch deletion when the primary worktree becomes detached after archive',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const remoteFeatureSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                installPrimaryDetachedWorktreeOnLocalArchiveHook(fixture);

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);

                expectApplyAndPruneReport(
                    applyReport,
                    fixture,
                    remoteFeatureSha,
                );
                expectFeatureArchivesPruned(fixture);
                expect(
                    git(fixture.repoPath, ['branch', '--show-current']),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps the local branch deletion when the primary worktree checks out the archive during revalidation',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const remoteFeatureSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                const env =
                    installArchiveCheckoutDuringPostArchiveSafetyHook(fixture);

                const applyReport = runGitCleanupJson(
                    fixture.repoPath,
                    ['git-cleanup', '--apply'],
                    env,
                );

                expectApplyAndPruneReport(
                    applyReport,
                    fixture,
                    remoteFeatureSha,
                );
                expect(
                    git(fixture.repoPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores a pinned branch in a sha256 repository',
            () => {
                const {
                    archivedBranchName,
                    movedArchiveSha,
                    originalBranchSha,
                    repoPath,
                } = createSha256PinnedRestoreFixture();

                const restoreResult = restoreArchivedBranchForTesting(
                    repoPath,
                    'feature',
                    archivedBranchName,
                    originalBranchSha,
                );

                expect(restoreResult.restored).toBe(true);
                expect(restoreResult.preservedArchiveRef).toBe(true);
                expect(restoreResult.errors).toEqual([]);
                expect(readCurrentSha(repoPath, 'feature')).toBe(
                    originalBranchSha,
                );
                expect(readCurrentSha(repoPath, archivedBranchName)).toBe(
                    movedArchiveSha,
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed instead of overwriting a concurrently recreated local branch during pinned restore',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-restore-race';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const originalBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                git(fixture.repoPath, ['branch', 'feature', 'main'], false);
                const concurrentlyRecreatedSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                    originalBranchSha,
                );

                expect(restoreResult.restored).toBe(false);
                expect(restoreResult.errors).not.toEqual([]);
                expect(readCurrentSha(fixture.repoPath, 'feature')).toBe(
                    concurrentlyRecreatedSha,
                );
                expect(
                    readCurrentSha(fixture.repoPath, archivedBranchName),
                ).toBe(originalBranchSha);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when pinned restore loses the archive ref',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-restore-missing';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const originalBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                git(
                    fixture.repoPath,
                    ['branch', '-D', archivedBranchName],
                    false,
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                    originalBranchSha,
                );

                expect(restoreResult.restored).toBe(false);
                expect(restoreResult.preservedArchiveRef).toBe(false);
                expect(restoreResult.errors.join('\n')).toContain(
                    'disappeared before restoration',
                );
                expect(
                    git(fixture.repoPath, ['branch', '--list', 'feature']),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when restored branch reflog gains an unsafe suffix',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/local/feature/manual-restore-reflog-suffix';

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                const originalBranchSha = readCurrentSha(
                    fixture.repoPath,
                    'feature',
                );
                const expectedReflogPrefix = readFileSync(
                    path.join(
                        readGitCommonDir(fixture.repoPath),
                        'logs',
                        'refs',
                        'heads',
                        'feature',
                    ),
                    'utf8',
                );
                const initialSha = git(fixture.repoPath, [
                    'rev-list',
                    '--max-parents=0',
                    'main',
                ]);
                git(
                    fixture.repoPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                installRestoredBranchReflogAppendHook(
                    fixture.repoPath,
                    fixture.tempPath,
                    'feature',
                    originalBranchSha,
                    initialSha,
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.repoPath,
                    'feature',
                    archivedBranchName,
                    originalBranchSha,
                    expectedReflogPrefix,
                );

                expect(restoreResult.restored).toBe(false);
                expect(restoreResult.errors.join('\n')).toContain(
                    'unexpected entries',
                );
                expect(readCurrentSha(fixture.repoPath, 'feature')).toBe(
                    originalBranchSha,
                );
                expect(
                    readCurrentSha(fixture.repoPath, archivedBranchName),
                ).toBe(originalBranchSha);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps a branch deleteable when a detached worktree still has local-only commits',
            () => {
                const fixture = createGitFixture();
                const detachedWorktreePath = path.join(
                    fixture.tempPath,
                    'detached-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                createDetachedWorktreeWithLocalOnlyCommit(
                    fixture,
                    'feature',
                    detachedWorktreePath,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const safeDeleteBranch = expectSafeDeleteBranch(auditReport);

                expect(safeDeleteBranch.deleteCommands).toEqual(
                    expect.arrayContaining([
                        expect.stringContaining('git-cleanup --apply'),
                    ]),
                );
                expect(
                    auditReport.detachedWorktrees.some(
                        (worktree) => !worktree.state.safeToRemoveManually,
                    ),
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'keeps linked worktrees in manual review even when they are clean',
            () => {
                const fixture = createGitFixture();
                const linkedWorktreePath = path.join(
                    fixture.tempPath,
                    'feature-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature');
                git(
                    fixture.repoPath,
                    ['worktree', 'add', linkedWorktreePath, 'feature'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'linked_worktrees_require_manual_review',
                );
                expect(reviewBranch?.linkedWorktrees).toHaveLength(1);
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('remote deletion hardening', () => {
        it(
            'fails remote archive transaction when protected HEAD target changed at the same SHA',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const featureSha = readCurrentSha(
                    fixture.originPath,
                    'feature',
                );
                const archiveBranchName =
                    'slop-refinery/archive/remote/feature/manual-head-target-check';

                git(
                    fixture.originPath,
                    ['symbolic-ref', 'HEAD', 'refs/heads/feature'],
                    false,
                );

                const archiveResult = archiveBranchRefTransactionForTesting(
                    fixture.originPath,
                    'feature',
                    archiveBranchName,
                    featureSha,
                    [
                        {
                            ref: 'HEAD',
                            sha: featureSha,
                            target: 'refs/heads/main',
                        },
                    ],
                );

                expectRemoteArchiveTransactionFailedWithoutArchive(
                    fixture,
                    archiveResult,
                    featureSha,
                    archiveBranchName,
                );
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails remote archive transaction when protected HEAD target is symbolic',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const featureSha = readCurrentSha(
                    fixture.originPath,
                    'feature',
                );
                const archiveBranchName =
                    'slop-refinery/archive/remote/feature/manual-head-target-symbolic';

                git(
                    fixture.originPath,
                    ['symbolic-ref', 'refs/heads/main', 'refs/heads/feature'],
                    false,
                );

                const archiveResult = archiveBranchRefTransactionForTesting(
                    fixture.originPath,
                    'feature',
                    archiveBranchName,
                    featureSha,
                    [
                        {
                            ref: 'HEAD',
                            sha: featureSha,
                            target: 'refs/heads/main',
                        },
                    ],
                );

                expect(archiveResult.ok).toBe(false);
                if (archiveResult.ok) {
                    throw new Error('Expected archive transaction to fail.');
                }
                expect(archiveResult.error).toContain(
                    'protected target ref refs/heads/main',
                );
                expect(readCurrentSha(fixture.originPath, 'feature')).toBe(
                    featureSha,
                );
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        `refs/heads/${archiveBranchName}`,
                        '--format=%(refname:short)',
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails remote archive transaction when the source branch moved after pinning',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                configureGitIdentity(fixture.originPath);
                const expectedFeatureSha = readCurrentSha(
                    fixture.originPath,
                    'feature',
                );
                const concurrentSha = createUnreferencedCommit(
                    fixture.originPath,
                    'Create concurrent remote branch move',
                );
                const archiveBranchName =
                    'slop-refinery/archive/remote/feature/manual-source-move';

                git(
                    fixture.originPath,
                    [
                        'update-ref',
                        'refs/heads/feature',
                        concurrentSha,
                        expectedFeatureSha,
                    ],
                    false,
                );

                const archiveResult = archiveBranchRefTransactionForTesting(
                    fixture.originPath,
                    'feature',
                    archiveBranchName,
                    expectedFeatureSha,
                );

                expect(archiveResult.ok).toBe(false);
                expect(readCurrentSha(fixture.originPath, 'feature')).toBe(
                    concurrentSha,
                );
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        `refs/heads/${archiveBranchName}`,
                        '--format=%(refname:short)',
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the remote branch when an origin worktree checks out the archive during final validation',
            () => {
                const fixture = createNonBareOriginFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const env =
                    installOriginCheckoutArchiveOnSecondPostArchiveWorktreeList(
                        fixture,
                        'feature',
                    );

                const applyReport = runGitCleanupJson(
                    fixture.repoPath,
                    ['git-cleanup', '--apply'],
                    env,
                );
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.remoteBranchDeleted).toBe(false);
                expect(applyResult?.remoteBackupRef).not.toBeNull();
                expect(applyResult?.remoteBranchSkippedReason).toContain(
                    'linked worktree state',
                );
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
                expect(
                    git(fixture.originPath, [
                        'worktree',
                        'list',
                        '--porcelain',
                    ]),
                ).toContain(
                    'branch refs/heads/slop-refinery/archive/remote/feature/',
                );
            },
            gitCleanupLongIntegrationTimeoutMs,
        );

        it(
            'fails closed when the live origin branch reflog still references force-pushed history outside main',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createForcePushedRemoteHistoryNotOnBase(fixture, 'feature');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_not_on_base',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        describe('hosted origin deletion', () => {
            it(
                'marks hosted origin branches safe using live tip and local tracking evidence',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    createForcePushedRemoteHistoryNotOnBase(fixture, 'feature');
                    makeOriginAppearHosted(fixture);

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);
                    const safeDeleteBranch =
                        expectSafeDeleteBranch(auditReport);

                    expect(safeDeleteBranch.remoteBranch?.status).toBe('safe');
                    expect(safeDeleteBranch.remoteBranch?.shortName).toBe(
                        'origin/feature',
                    );
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'keeps hosted origin branches in review when the local tracking ref is symbolic',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    makeOriginAppearHosted(fixture);
                    git(
                        fixture.repoPath,
                        [
                            'symbolic-ref',
                            'refs/remotes/origin/feature',
                            'refs/remotes/origin/main',
                        ],
                        false,
                    );

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);
                    const reviewBranch = findBranchReport(
                        auditReport,
                        'needsReview',
                        'feature',
                    );

                    expect(reviewBranch?.reasonCodes).toContain(
                        'origin_branch_identity_unverified',
                    );
                    expect(
                        findBranchReport(auditReport, 'safeDelete', 'feature'),
                    ).toBe(undefined);
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'deletes hosted origin branches with a force-with-lease guard',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const remoteFeatureSha = readCurrentSha(
                        fixture.originPath,
                        'feature',
                    );
                    makeOriginAppearHosted(fixture);

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expectSafeDeleteBranch(auditReport);

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                        '--keep-archives',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expectHostedFeatureDeletedLocallyAndRemotely(
                        fixture,
                        applyResult,
                        remoteFeatureSha,
                    );
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'applies local cleanup when a hosted origin branch is already absent',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const localFeatureSha = readCurrentSha(
                        fixture.repoPath,
                        'feature',
                    );
                    deleteRemoteBranchFromSecondClone(fixture, 'feature');
                    makeOriginAppearHosted(fixture);

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);
                    const safeDeleteBranch =
                        expectSafeDeleteBranch(auditReport);

                    expect(safeDeleteBranch.remoteBranch?.status).toBe(
                        'absent',
                    );

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                        '--keep-archives',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expectHostedAbsentFeatureDeletedLocally(
                        fixture,
                        applyResult,
                        localFeatureSha,
                    );
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'restores the local branch when a hosted origin branch moves after local archive',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const secondClonePath =
                        installOriginMoveAfterLocalArchive(fixture);
                    makeOriginAppearHosted(fixture);

                    const auditReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                    ]);

                    expectSafeDeleteBranch(auditReport);

                    const applyReport = runGitCleanupJson(fixture.repoPath, [
                        'git-cleanup',
                        '--apply',
                    ]);
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expectRemoteDriftRestoredLocalBranch(
                        fixture,
                        secondClonePath,
                        applyReport,
                        applyResult,
                    );
                },
                gitCleanupIntegrationTimeoutMs,
            );

            it(
                'restores hosted origin branches when final validation fails after delete',
                () => {
                    const fixture = createGitFixture();

                    createMergedFeatureBranch(fixture.repoPath, 'feature', {
                        pushRemote: true,
                    });
                    const originalFeatureSha = readCurrentSha(
                        fixture.originPath,
                        'feature',
                    );
                    makeOriginAppearHosted(fixture);
                    const env = installOriginHeadRepointAfterHostedDelete(
                        fixture,
                        'feature',
                        'alternate-main',
                    );

                    const auditReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup'],
                        env,
                    );

                    expectSafeDeleteBranch(auditReport);

                    const applyReport = runGitCleanupJson(
                        fixture.repoPath,
                        ['git-cleanup', '--apply'],
                        env,
                    );
                    const applyResult = findApplyResult(applyReport, 'feature');

                    expect(applyResult?.localBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchDeleted).toBe(false);
                    expect(applyResult?.remoteBranchSkippedReason).toContain(
                        'live origin branch was restored',
                    );
                    expect(readCurrentSha(fixture.repoPath, 'feature')).toBe(
                        originalFeatureSha,
                    );
                    expect(readCurrentSha(fixture.originPath, 'feature')).toBe(
                        originalFeatureSha,
                    );
                },
                gitCleanupIntegrationTimeoutMs,
            );
        });

        it(
            'fails closed when hidden remote refs still preserve non-base history',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createHiddenRemoteRefNotOnBase(
                    fixture,
                    'refs/original/feature-hidden',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_not_on_base',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'reports protected main for review when local origin has hidden non-base history',
            () => {
                const fixture = createGitFixture();

                createHiddenRemoteRefNotOnBase(
                    fixture,
                    'refs/original/main-hidden',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'main',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_not_on_base',
                );
                expect(
                    auditReport.branches.skipped.some(
                        (branch) => branch.name === 'main',
                    ),
                ).toBe(false);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when the live origin branch is checked out in a non-bare local origin worktree',
            () => {
                const fixture = createNonBareOriginFixture();
                const originFeatureWorktreePath = path.join(
                    fixture.tempPath,
                    'origin-feature-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.originPath,
                    ['worktree', 'add', originFeatureWorktreePath, 'feature'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_checked_out_in_origin_worktree',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a local-path origin worktree has uncommitted local state',
            () => {
                const fixture = createNonBareOriginFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                writeFile(
                    path.join(fixture.originPath, 'dirty-origin.txt'),
                    'dirty\n',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_checked_out_in_origin_worktree',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when the live origin branch is checked out in a bare local origin linked worktree',
            () => {
                const fixture = createGitFixture();
                const originFeatureWorktreePath = path.join(
                    fixture.tempPath,
                    'origin-bare-feature-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.originPath,
                    ['worktree', 'add', originFeatureWorktreePath, 'feature'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_checked_out_in_origin_worktree',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a bare local-path origin has in-progress git admin state',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                writeFile(
                    path.join(fixture.originPath, 'CHERRY_PICK_HEAD'),
                    git(fixture.originPath, ['rev-parse', 'feature']),
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_checked_out_in_origin_worktree',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a local origin linked worktree is detached so branch use cannot be ruled out',
            () => {
                const fixture = createGitFixture();
                const originFeatureWorktreePath = path.join(
                    fixture.tempPath,
                    'origin-detached-feature-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.originPath,
                    ['worktree', 'add', originFeatureWorktreePath, 'feature'],
                    false,
                );
                git(originFeatureWorktreePath, ['checkout', '--detach'], false);

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_checked_out_in_origin_worktree',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when remote reflogs retain non-base history even after refs move back to main',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createMovedRemoteTagReflogHistoryNotOnBase(
                    fixture,
                    'retained-remote-history',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_not_on_base',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    describe('remote deletion race hardening', () => {
        it(
            'fails closed when the local-path origin still has unreachable off-base history after branch reflog evidence is gone',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createForcePushedRemoteHistoryNotOnBase(fixture, 'feature');
                removeRefReflog(fixture.originPath, 'refs', 'heads', 'feature');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_not_on_base',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when the live local-path origin branch reflog is missing',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                removeRefReflog(fixture.originPath, 'refs', 'heads', 'feature');

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_unverified',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBeUndefined();
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when the local-path origin contains unreachable non-commit objects',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createUnreachableBlob(fixture.originPath);

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_not_on_base',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a local-path origin annotated tag object is not reachable from main',
            () => {
                const fixture = createGitFixture();
                const secondClonePath = path.join(
                    fixture.tempPath,
                    'second-clone',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.tempPath,
                    ['clone', fixture.originPath, secondClonePath],
                    false,
                );
                configureGitIdentity(secondClonePath);
                git(
                    secondClonePath,
                    [
                        'tag',
                        '-a',
                        'origin-retained-main-tag-object',
                        '-m',
                        'Retain origin annotated tag object',
                        'main',
                    ],
                    false,
                );
                git(
                    secondClonePath,
                    ['push', 'origin', 'origin-retained-main-tag-object'],
                    false,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_not_on_base',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when a local-path origin detached worktree HEAD keeps off-base history after its reflog is removed',
            () => {
                const fixture = createGitFixture();
                const originDetachedWorktreePath = path.join(
                    fixture.tempPath,
                    'origin-detached-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createDetachedOriginWorktreeWithLocalOnlyCommitAndNoReflog(
                    fixture,
                    originDetachedWorktreePath,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_checked_out_in_origin_worktree',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it('treats a detached primary local-path origin HEAD as retained remote history', () => {
            const fixture = createGitFixture();
            const offBaseSha = createUnreferencedCommit(
                fixture.originPath,
                'Create primary origin HEAD-only work',
            );

            writeFile(path.join(fixture.originPath, 'HEAD'), `${offBaseSha}\n`);

            expect(
                readReachableHiddenRefsForTesting(
                    fixture.originPath,
                    'refs/heads/main',
                ),
            ).toContain('HEAD');
        });

        it(
            'fails closed when a non-bare local-path origin detached worktree HEAD keeps off-base history after its reflog is removed',
            () => {
                const fixture = createNonBareOriginFixture();
                const originDetachedWorktreePath = path.join(
                    fixture.tempPath,
                    'origin-non-bare-detached-worktree',
                );

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createDetachedOriginWorktreeWithLocalOnlyCommitAndNoReflog(
                    fixture,
                    originDetachedWorktreePath,
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_checked_out_in_origin_worktree',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when the local-path origin repo has grafts',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                writeFile(
                    path.join(
                        readGitCommonDir(fixture.originPath),
                        'info',
                        'grafts',
                    ),
                    'deadbeef deadbeef\n',
                );

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);
                const reviewBranch = findBranchReport(
                    auditReport,
                    'needsReview',
                    'feature',
                );

                expect(reviewBranch?.reasonCodes).toContain(
                    'origin_branch_history_unverified',
                );
                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature'),
                ).toBe(undefined);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'ignores preserved git-cleanup remote archive branches in later audits',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });

                const auditReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);

                expect(
                    findBranchReport(auditReport, 'safeDelete', 'feature')
                        ?.classification,
                ).toBe('safe_delete');

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.remoteBranchDeleted).toBe(true);

                git(fixture.repoPath, ['fetch', 'origin', '--prune'], false);
                const postApplyAudit = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                ]);

                expect(
                    postApplyAudit.branches.needsReview.some((candidate) =>
                        candidate.reasonCodes.includes(
                            'repository_hidden_refs_present',
                        ),
                    ),
                ).toBe(false);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the remote branch when the archive reflog is replaced after rename',
            () => {
                const fixture = createGitFixture();

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                installArchiveReflogReplacementHook(
                    fixture.originPath,
                    fixture.tempPath,
                    'remote',
                    'feature',
                );

                const applyReport = runGitCleanupJson(fixture.repoPath, [
                    'git-cleanup',
                    '--apply',
                ]);
                const applyResult = findApplyResult(applyReport, 'feature');

                expect(applyResult?.remoteBranchDeleted).toBe(false);
                expect(applyResult?.remoteBackupRef).toBe(null);
                expect(applyResult?.remoteBranchSkippedReason).toContain(
                    'did not validate',
                );
                expect(applyResult?.errors.join('\n')).toContain(
                    'reflog did not preserve',
                );
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toBe('feature');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed when archived remote branch validation loses the preserving reflog',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/remote/feature/manual-check';

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.originPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                removeRefReflog(
                    fixture.originPath,
                    'refs',
                    'heads',
                    ...archivedBranchName.split('/'),
                );

                const archivedBranchValidation =
                    validateArchivedBranchForTesting(
                        fixture.originPath,
                        'feature',
                        archivedBranchName,
                        readCurrentSha(fixture.originPath, archivedBranchName),
                    );

                expect(archivedBranchValidation.archived).toBe(false);
                expect(
                    archivedBranchValidation.errors.some((error) =>
                        error.includes('reflog'),
                    ),
                ).toBe(true);
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the original remote branch name from the current archived tip',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/remote/feature/manual-restore';

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                git(
                    fixture.originPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.originPath,
                    'feature',
                    archivedBranchName,
                );

                expect(restoreResult.restored).toBe(true);
                expect(restoreResult.errors).toEqual([]);
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        'refs/heads/feature',
                        '--format=%(refname:short)',
                    ]),
                ).toContain('feature');
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        `refs/heads/${archivedBranchName}`,
                        '--format=%(refname:short)',
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'restores the original remote branch name from the current archived tip if the archive ref moved',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/remote/feature/manual-restore-moved';

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                createHiddenRemoteRefNotOnBase(
                    fixture,
                    'refs/original/remote-restore-moved',
                );
                const movedArchiveSha = readCurrentSha(
                    fixture.originPath,
                    'refs/original/remote-restore-moved',
                );

                git(
                    fixture.originPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                git(
                    fixture.originPath,
                    ['branch', '-f', archivedBranchName, movedArchiveSha],
                    false,
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.originPath,
                    'feature',
                    archivedBranchName,
                );

                expect(restoreResult.restored).toBe(true);
                expect(restoreResult.errors).toEqual([]);
                expect(readCurrentSha(fixture.originPath, 'feature')).toBe(
                    movedArchiveSha,
                );
                expect(
                    git(fixture.originPath, [
                        'for-each-ref',
                        `refs/heads/${archivedBranchName}`,
                        '--format=%(refname:short)',
                    ]),
                ).toBe('');
            },
            gitCleanupIntegrationTimeoutMs,
        );

        it(
            'fails closed instead of overwriting a concurrently recreated remote branch during pinned restore',
            () => {
                const fixture = createGitFixture();
                const archivedBranchName =
                    'slop-refinery/archive/remote/feature/manual-restore-race';

                createMergedFeatureBranch(fixture.repoPath, 'feature', {
                    pushRemote: true,
                });
                const originalBranchSha = readCurrentSha(
                    fixture.originPath,
                    'feature',
                );
                git(
                    fixture.originPath,
                    ['branch', '-m', 'feature', archivedBranchName],
                    false,
                );
                git(fixture.originPath, ['branch', 'feature', 'main'], false);
                const concurrentlyRecreatedSha = readCurrentSha(
                    fixture.originPath,
                    'feature',
                );

                const restoreResult = restoreArchivedBranchForTesting(
                    fixture.originPath,
                    'feature',
                    archivedBranchName,
                    originalBranchSha,
                );

                expect(restoreResult.restored).toBe(false);
                expect(restoreResult.errors).not.toEqual([]);
                expect(readCurrentSha(fixture.originPath, 'feature')).toBe(
                    concurrentlyRecreatedSha,
                );
                expect(
                    readCurrentSha(fixture.originPath, archivedBranchName),
                ).toBe(originalBranchSha);
            },
            gitCleanupIntegrationTimeoutMs,
        );
    });

    it(
        'treats locked worktrees as manual-review state',
        () => {
            const fixture = createGitFixture();
            const linkedWorktreePath = path.join(
                fixture.tempPath,
                'feature-worktree',
            );

            createMergedFeatureBranch(fixture.repoPath, 'feature');
            git(
                fixture.repoPath,
                ['worktree', 'add', linkedWorktreePath, 'feature'],
                false,
            );
            git(
                fixture.repoPath,
                ['worktree', 'lock', linkedWorktreePath],
                false,
            );

            const auditReport = runGitCleanupJson(fixture.repoPath, [
                'git-cleanup',
            ]);
            const reviewBranch = findBranchReport(
                auditReport,
                'needsReview',
                'feature',
            );

            expect(reviewBranch?.reasonCodes).toContain(
                'linked_worktree_dirty',
            );
            expect(
                reviewBranch?.linkedWorktrees[0]?.statusLines.some(
                    (statusLine) => statusLine.includes('locked'),
                ),
            ).toBe(true);
        },
        gitCleanupIntegrationTimeoutMs,
    );

    it(
        'refuses to run when replace refs are present',
        () => {
            const fixture = createGitFixture();

            createMergedFeatureBranch(fixture.repoPath, 'feature');

            const mainSha = git(fixture.repoPath, ['rev-parse', 'main']);
            const featureSha = git(fixture.repoPath, ['rev-parse', 'feature']);

            git(fixture.repoPath, ['replace', featureSha, mainSha], false);

            const result = runGitCleanup(fixture.repoPath, [
                'git-cleanup',
                '--json',
            ]);

            expect(result.status).toBe(1);
            expect(result.output).toContain('refs/replace');
        },
        gitCleanupIntegrationTimeoutMs,
    );
});
