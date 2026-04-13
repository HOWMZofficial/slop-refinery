import type { Linter } from 'eslint';

export const FUNCTION_STYLE_RULES: Linter.RulesRecord = {
    'func-style': ['error', 'declaration', { allowArrowFunctions: false }],
    'functional/no-let': [
        'error',
        {
            allowInForLoopInit: true,
            ignoreIdentifierPattern: '^[mM]utable',
        },
    ],
};
