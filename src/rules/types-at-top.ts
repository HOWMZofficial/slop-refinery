import type { Rule } from 'eslint';

type AnyValue = any;

export const typesAtTopRule: Rule.RuleModule = {
    create(context: AnyValue) {
        return {
            Program(node: AnyValue) {
                let hasNonTypeStatement = false;

                for (const statement of node.body) {
                    if (statement.type === 'ImportDeclaration') {
                        continue;
                    }

                    if (isTypeDefinitionStatement(statement)) {
                        if (hasNonTypeStatement) {
                            context.report({
                                messageId: 'typeAfterCode',
                                node: getTypeDefinitionNode(statement),
                            });
                        }
                        continue;
                    }

                    hasNonTypeStatement = true;
                }
            },
        };
    },
    meta: {
        docs: {
            description:
                'Require type declarations to appear before non-type statements.',
        },
        messages: {
            typeAfterCode:
                'Type declarations should appear before non-type statements.',
        },
        schema: [],
        type: 'suggestion',
    },
};

function getTypeDefinitionNode(statement: AnyValue): AnyValue {
    if (
        statement.type === 'ExportNamedDeclaration' &&
        statement.declaration &&
        isTypeDeclarationNode(statement.declaration)
    ) {
        return statement.declaration;
    }

    return statement;
}

function isTypeDeclarationNode(node: AnyValue): boolean {
    return (
        node?.type === 'TSInterfaceDeclaration' ||
        node?.type === 'TSModuleDeclaration' ||
        node?.type === 'TSTypeAliasDeclaration'
    );
}

function isTypeDefinitionStatement(statement: AnyValue): boolean {
    if (isTypeDeclarationNode(statement)) {
        return true;
    }

    if (statement.type !== 'ExportNamedDeclaration') {
        return false;
    }

    if (statement.declaration && isTypeDeclarationNode(statement.declaration)) {
        return true;
    }

    return statement.exportKind === 'type';
}
