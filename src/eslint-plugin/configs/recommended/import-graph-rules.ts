import type { Linter } from 'eslint';

export const IMPORT_GRAPH_RULES: Linter.RulesRecord = {
    'import-x/no-cycle': ['error', { ignoreExternal: true }],
    'import-x/no-self-import': 'error',
};
