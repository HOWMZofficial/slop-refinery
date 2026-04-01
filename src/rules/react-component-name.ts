import type { Rule } from 'eslint';

type AnyValue = any;

export const reactComponentNameRule: Rule.RuleModule = {
    create(context: AnyValue) {
        return {
            Program(programNode: AnyValue) {
                if (context.getFilename().endsWith('.tsx') === false) {
                    return;
                }

                const exportedNames = readExportedNames(programNode);
                const sourceCode = context.getSourceCode();
                for (const statement of programNode.body) {
                    const isExported = isExportedDeclaration(statement);
                    const declaration = unwrapDeclaration(statement);
                    if (declaration === null) {
                        continue;
                    }

                    for (const component of readComponentDefinitions(
                        declaration,
                        sourceCode,
                    )) {
                        if (
                            isExported === false &&
                            exportedNames.has(component.name) === false &&
                            component.name[0] !==
                                component.name[0]?.toUpperCase()
                        ) {
                            continue;
                        }

                        if (isPascalCase(component.name) === true) {
                            continue;
                        }

                        context.report({
                            data: { componentName: component.name },
                            messageId: 'invalidComponentName',
                            node: component.node,
                        });
                    }
                }
            },
        };
    },
    meta: {
        docs: {
            description:
                'Require PascalCase names for React component definitions.',
        },
        messages: {
            invalidComponentName:
                "React component '{{componentName}}' must be PascalCase.",
        },
        schema: [],
        type: 'problem',
    },
};

function readExportedNames(programNode: AnyValue): Set<string> {
    const exportedNames = new Set<string>();

    for (const statement of programNode.body) {
        if (
            statement.type === 'ExportDefaultDeclaration' &&
            statement.declaration?.type === 'Identifier'
        ) {
            exportedNames.add(statement.declaration.name);
            continue;
        }

        if (
            statement.type !== 'ExportNamedDeclaration' ||
            statement.declaration !== null
        ) {
            continue;
        }

        for (const specifier of statement.specifiers ?? []) {
            if (specifier.local?.type === 'Identifier') {
                exportedNames.add(specifier.local.name);
            }
        }
    }

    return exportedNames;
}

function isClassComponent(classNode: AnyValue): boolean {
    const superClass = classNode.superClass;
    if (superClass === undefined || superClass === null) {
        return false;
    }

    if (
        superClass.type === 'Identifier' &&
        ['Component', 'PureComponent'].includes(superClass.name)
    ) {
        return true;
    }

    return (
        superClass.type === 'MemberExpression' &&
        superClass.object.type === 'Identifier' &&
        superClass.object.name === 'React' &&
        superClass.property.type === 'Identifier' &&
        ['Component', 'PureComponent'].includes(superClass.property.name)
    );
}

function isExportedDeclaration(statement: AnyValue): boolean {
    return (
        statement.type === 'ExportDefaultDeclaration' ||
        statement.type === 'ExportNamedDeclaration'
    );
}

function isFunctionComponent(
    functionNode: AnyValue,
    sourceCode: AnyValue,
): boolean {
    return (
        containsJsx(functionNode.body, new WeakSet()) === true ||
        hasReactElementReturnType(functionNode, sourceCode) === true
    );
}

function isPascalCase(value: string): boolean {
    return /^[A-Z][A-Za-z0-9]*$/.test(value);
}

function isVariableComponent(init: AnyValue, sourceCode: AnyValue): boolean {
    if (
        init === undefined ||
        init === null ||
        !['ArrowFunctionExpression', 'FunctionExpression'].includes(init.type)
    ) {
        return false;
    }

    return (
        containsJsx(init.body, new WeakSet()) === true ||
        hasReactElementReturnType(init, sourceCode) === true
    );
}

function hasReactElementReturnType(
    node: AnyValue,
    sourceCode: AnyValue,
): boolean {
    if (node.returnType === undefined || node.returnType === null) {
        return false;
    }

    return /\b(?:JSX\.Element|ReactElement)\b/.test(
        sourceCode.getText(node.returnType.typeAnnotation),
    );
}

function readComponentDefinitions(
    declaration: AnyValue,
    sourceCode: AnyValue,
): Array<{ name: string; node: AnyValue }> {
    if (
        declaration.type === 'ClassDeclaration' &&
        declaration.id !== null &&
        isClassComponent(declaration) === true
    ) {
        return [{ name: declaration.id.name, node: declaration.id }];
    }

    if (
        declaration.type === 'FunctionDeclaration' &&
        declaration.id !== null &&
        isFunctionComponent(declaration, sourceCode) === true
    ) {
        return [{ name: declaration.id.name, node: declaration.id }];
    }

    if (declaration.type !== 'VariableDeclaration') {
        return [];
    }

    return declaration.declarations.flatMap((variableDeclaration: AnyValue) => {
        if (variableDeclaration.id.type !== 'Identifier') {
            return [];
        }

        if (
            isVariableComponent(variableDeclaration.init, sourceCode) === false
        ) {
            return [];
        }

        return [
            {
                name: variableDeclaration.id.name,
                node: variableDeclaration.id,
            },
        ];
    });
}

function unwrapDeclaration(statement: AnyValue): AnyValue {
    if (isExportedDeclaration(statement) === true) {
        return statement.declaration ?? null;
    }

    return statement;
}

function containsJsx(node: AnyValue, visitedNodes: WeakSet<object>): boolean {
    if (node === undefined || node === null || typeof node !== 'object') {
        return false;
    }

    if (visitedNodes.has(node) === true) {
        return false;
    }

    visitedNodes.add(node);

    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        return true;
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === 'parent') {
            continue;
        }

        if (Array.isArray(value) === true) {
            if (
                value.some(
                    (item) => containsJsx(item, visitedNodes) === true,
                ) === true
            ) {
                return true;
            }
            continue;
        }

        if (containsJsx(value, visitedNodes) === true) {
            return true;
        }
    }

    return false;
}
