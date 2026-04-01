import type { Rule } from 'eslint';

import { functionOrderRule } from './rules/function-order.ts';
import { initAtBottomRule } from './rules/init-at-bottom.ts';
import { noDefaultExportRule } from './rules/no-default-export.ts';
import { reactComponentNameRule } from './rules/react-component-name.ts';
import { typesAtTopRule } from './rules/types-at-top.ts';

export const rules: Record<string, Rule.RuleModule> = {
    'function-order': functionOrderRule,
    'init-at-bottom': initAtBottomRule,
    'no-default-export': noDefaultExportRule,
    'react-component-name': reactComponentNameRule,
    'types-at-top': typesAtTopRule,
};

export const slopRefinery = {
    meta: {
        name: 'slop-refinery',
    },
    rules,
};
