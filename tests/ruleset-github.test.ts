import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.fn();

vi.mock('node:child_process', () => {
    return {
        execFileSync: execFileSyncMock,
    };
});

describe('ruleset gh integration', () => {
    beforeEach(() => {
        execFileSyncMock.mockReset();
        vi.resetModules();
    });

    it('parses ruleset summaries from gh api output', async () => {
        execFileSyncMock.mockReturnValue('[{"id":1},{"ignored":true}]');

        const { listRulesetSummaries } =
            await import('../src/lib/ruleset/github.ts');
        const rulesets = await listRulesetSummaries({
            owner: 'HOWMZofficial',
            repo: 'slop-refinery',
        });

        expect(rulesets).toEqual([{ id: 1 }]);
        expect(execFileSyncMock).toHaveBeenCalledWith(
            'gh',
            ['api', 'repos/HOWMZofficial/slop-refinery/rulesets'],
            expect.objectContaining({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }),
        );
    });

    it('surfaces gh stderr when gh reports an authentication failure', async () => {
        execFileSyncMock.mockImplementation(() => {
            throw Object.assign(new Error('Command failed'), {
                stderr: 'gh auth status: not logged in',
            });
        });

        const { listRulesetSummaries } =
            await import('../src/lib/ruleset/github.ts');

        await expect(
            listRulesetSummaries({
                owner: 'HOWMZofficial',
                repo: 'slop-refinery',
            }),
        ).rejects.toThrow('gh auth status: not logged in');
    });

    it('reports when gh is not installed', async () => {
        execFileSyncMock.mockImplementation(() => {
            throw Object.assign(new Error('spawnSync gh ENOENT'), {
                code: 'ENOENT',
            });
        });

        const { listRulesetSummaries } =
            await import('../src/lib/ruleset/github.ts');

        await expect(
            listRulesetSummaries({
                owner: 'HOWMZofficial',
                repo: 'slop-refinery',
            }),
        ).rejects.toThrow(
            'GitHub CLI `gh` is required but was not found in PATH.',
        );
    });
});
