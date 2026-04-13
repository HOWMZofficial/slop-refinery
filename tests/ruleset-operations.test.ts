import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRulesetSummariesMock = vi.fn();
const readRepositoryDefaultBranchMock = vi.fn();
const readRulesetDetailMock = vi.fn();
const upsertRulesetMock = vi.fn();

vi.mock('../src/lib/ruleset/github.ts', () => {
    return {
        listRulesetSummaries: listRulesetSummariesMock,
        readRepositoryDefaultBranch: readRepositoryDefaultBranchMock,
        readRulesetDetail: readRulesetDetailMock,
        upsertRuleset: upsertRulesetMock,
    };
});

describe('ruleset operations', () => {
    beforeEach(() => {
        listRulesetSummariesMock.mockReset();
        readRepositoryDefaultBranchMock.mockReset();
        readRulesetDetailMock.mockReset();
        upsertRulesetMock.mockReset();
        vi.resetModules();
    });

    it('matches ~DEFAULT_BRANCH for the repository default branch', async () => {
        listRulesetSummariesMock.mockResolvedValue([{ id: 1 }]);
        readRepositoryDefaultBranchMock.mockResolvedValue('main');
        readRulesetDetailMock.mockResolvedValue({
            bypass_actors: [],
            conditions: {
                ref_name: {
                    exclude: [],
                    include: ['~DEFAULT_BRANCH'],
                },
            },
            enforcement: 'active',
            id: 1,
            name: 'main',
            rules: [],
            target: 'branch',
        });

        const { findBranchRuleset } =
            await import('../src/lib/ruleset/operations.ts');
        const result = await findBranchRuleset({
            branch: 'main',
            owner: 'HOWMZofficial',
            repo: 'modeling',
        });

        expect(result?.id).toBe(1);
        expect(readRepositoryDefaultBranchMock).toHaveBeenCalledTimes(1);
    });

    it('does not match ~DEFAULT_BRANCH for a different branch', async () => {
        listRulesetSummariesMock.mockResolvedValue([{ id: 1 }]);
        readRepositoryDefaultBranchMock.mockResolvedValue('main');
        readRulesetDetailMock.mockResolvedValue({
            bypass_actors: [],
            conditions: {
                ref_name: {
                    exclude: [],
                    include: ['~DEFAULT_BRANCH'],
                },
            },
            enforcement: 'active',
            id: 1,
            name: 'main',
            rules: [],
            target: 'branch',
        });

        const { findBranchRuleset } =
            await import('../src/lib/ruleset/operations.ts');
        const result = await findBranchRuleset({
            branch: 'release',
            owner: 'HOWMZofficial',
            repo: 'modeling',
        });

        expect(result).toBeUndefined();
    });
});
