import { readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import { repoPath } from './test-harness.ts';

function collectHiddenEntries(
    rootPath: string,
    currentRelativePath = '',
): string[] {
    return readdirSync(path.join(rootPath, currentRelativePath), {
        withFileTypes: true,
    }).flatMap((entry) => {
        const entryRelativePath = path.join(currentRelativePath, entry.name);
        const hiddenEntries = entry.name.startsWith('.')
            ? [entryRelativePath]
            : [];

        return entry.isDirectory()
            ? [
                  ...hiddenEntries,
                  ...collectHiddenEntries(rootPath, entryRelativePath),
              ]
            : hiddenEntries;
    });
}

it('avoids hidden template files that skills does not copy', () => {
    const templateRootPath = repoPath(
        'skills',
        'slop-refinery-setup',
        'references',
        'templates',
    );

    expect(collectHiddenEntries(templateRootPath)).toStrictEqual([]);
});
