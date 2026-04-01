import type { Rule } from 'eslint';

type AnyValue = any;

export const noDefaultExportRule: Rule.RuleModule = {
    create(context: AnyValue) {
        return {
            ExportDefaultDeclaration(node: AnyValue) {
                context.report({
                    messageId: 'noDefaultExport',
                    node,
                });
            },
        };
    },
    meta: {
        docs: {
            description: 'Disallow default exports.',
        },
        messages: {
            noDefaultExport: 'Default exports are not allowed.',
        },
        schema: [],
        type: 'problem',
    },
};
