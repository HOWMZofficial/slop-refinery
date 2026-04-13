import type { Linter } from 'eslint';

export const SLOP_REFINERY_RULES: Linter.RulesRecord = {
    'slop-refinery/function-order': 'error',
    'slop-refinery/init-at-bottom': 'error',
    'slop-refinery/no-default-export': 'error',
};
