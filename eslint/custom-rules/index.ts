import type { Rule } from 'eslint';

import { requireIdenticalFilesRule } from './require-identical-files.ts';

const rules: Record<string, Rule.RuleModule> = {
    'require-identical-files': requireIdenticalFilesRule,
};

const slopRefineryRepo = {
    meta: {
        name: 'slop-refinery-repo',
    },
    rules,
};

export default slopRefineryRepo;
