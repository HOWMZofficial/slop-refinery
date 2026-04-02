import type { Rule } from 'eslint';

import { functionOrderRule } from './rules/function-order.ts';
import { initAtBottomRule } from './rules/init-at-bottom.ts';
import { noDefaultExportRule } from './rules/no-default-export.ts';
import { typesAtTopRule } from './rules/types-at-top.ts';

const rules: Record<string, Rule.RuleModule> = {
    'function-order': functionOrderRule,
    'init-at-bottom': initAtBottomRule,
    'no-default-export': noDefaultExportRule,
    'types-at-top': typesAtTopRule,
};

export const slopRefinery = {
    meta: {
        name: 'slop-refinery',
    },
    rules,
};
