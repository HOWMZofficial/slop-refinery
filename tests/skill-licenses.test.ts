import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const expectedLicenseField = 'license: MIT';
const repoPath = process.cwd();
const rootLicense = readFileSync(path.join(repoPath, 'LICENSE'));
const skillsPath = path.join(repoPath, 'skills');
const skillDirectories = readdirSync(skillsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

describe('skill licenses', () => {
    it.each(skillDirectories)('%s bundles the repository license', (skill) => {
        const skillPath = path.join(skillsPath, skill);
        const skillMarkdown = readFileSync(
            path.join(skillPath, 'SKILL.md'),
            'utf8',
        );

        expect(skillMarkdown.split('---', 3)[1]).toContain(
            `\n${expectedLicenseField}\n`,
        );
        expect(readFileSync(path.join(skillPath, 'LICENSE'))).toEqual(
            rootLicense,
        );
    });
});
