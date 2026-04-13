import type { Linter } from 'eslint';

const KEBAB_CASE_PATTERN = '+([a-z])*([a-z0-9])*(-+([a-z0-9]))';
const DOT_SEPARATED_KEBAB_CASE_PATTERN = `*(${KEBAB_CASE_PATTERN}.)${KEBAB_CASE_PATTERN}`;

export function createFileNamingRules(
    sourceFilePattern: string,
): Linter.RulesRecord {
    return {
        'check-file/filename-naming-convention': [
            'error',
            {
                [sourceFilePattern]: DOT_SEPARATED_KEBAB_CASE_PATTERN,
            },
        ],
        'check-file/folder-naming-convention': [
            'error',
            {
                '**/*/': 'KEBAB_CASE',
            },
        ],
    };
}
