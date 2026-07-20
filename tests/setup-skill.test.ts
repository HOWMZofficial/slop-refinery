import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoTemplatePath = path.join(
    process.cwd(),
    '.github',
    'pull_request_template.md',
);
const setupTemplatePath = path.join(
    process.cwd(),
    'skills',
    'slop-refinery-setup',
    'references',
    'templates',
    'typescript',
    '.github',
    'pull_request_template.md',
);

describe('slop-refinery setup skill', () => {
    it('ships the repository PR template unchanged', () => {
        expect(readFileSync(setupTemplatePath, 'utf8')).toBe(
            readFileSync(repoTemplatePath, 'utf8'),
        );
    });
});
