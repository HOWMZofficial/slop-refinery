import type { Linter } from 'eslint';

export const IMPORT_GRAPH_RULES: Linter.RulesRecord = {
    'import/no-cycle': ['error', { ignoreExternal: true }],
    'import/no-self-import': 'error',
};
