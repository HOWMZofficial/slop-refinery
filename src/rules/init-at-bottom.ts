import type { Rule } from 'eslint';

type AnyValue = any;

type InitAtBottomOptions = {
    names?: string[];
};

export const initAtBottomRule: Rule.RuleModule = {
    create(context: AnyValue) {
        const initNames = readInitNames(context.options?.[0]);
        const initNamesText = [...initNames].join(', ');

        return {
            Program(node: AnyValue) {
                const statements = node.body;
                const functionInfos: AnyValue[] = [];
                const initFunctions: AnyValue[] = [];
                const initCalls: AnyValue[] = [];
                const executableStatements: AnyValue[] = [];

                for (let index = 0; index < statements.length; index += 1) {
                    const statement = statements[index];
                    const callName = getInitCallName(statement, initNames);
                    if (callName) {
                        initCalls.push({
                            index,
                            name: callName,
                            node: statement,
                        });
                    }

                    if (isExecutableStatement(statement) && !callName) {
                        executableStatements.push(statement);
                    }

                    const declarations = getFunctionDeclarations(statement);
                    for (const declaration of declarations) {
                        functionInfos.push({
                            index,
                            name: declaration.name,
                            node: declaration.node,
                        });
                        if (
                            isFunctionInitializer(declaration.name, initNames)
                        ) {
                            initFunctions.push({
                                index,
                                name: declaration.name,
                                node: declaration.node,
                            });
                        }
                    }
                }

                if (initFunctions.length > 1) {
                    for (const initFunction of initFunctions) {
                        context.report({
                            data: {
                                initNames: initNamesText,
                            },
                            messageId: 'multipleInitFunctions',
                            node: initFunction.node,
                        });
                    }
                }

                if (initCalls.length > 1) {
                    for (const initCall of initCalls) {
                        context.report({
                            data: {
                                initNames: initNamesText,
                            },
                            messageId: 'multipleInitCalls',
                            node: initCall.node,
                        });
                    }
                }

                const initFunction = initFunctions[0] ?? null;
                const initCall = initCalls[0] ?? null;
                const initName =
                    initFunction?.name ?? [...initNames][0] ?? 'main';

                if (initFunction) {
                    for (const functionInfo of functionInfos) {
                        if (
                            functionInfo.index < initFunction.index &&
                            !isFunctionInitializer(functionInfo.name, initNames)
                        ) {
                            context.report({
                                data: {
                                    helperName: functionInfo.name,
                                    initName: initFunction.name,
                                },
                                messageId: 'initFunctionFirst',
                                node: functionInfo.node,
                            });
                        }
                    }
                }

                if (initCall) {
                    if (statements[statements.length - 1] !== initCall.node) {
                        context.report({
                            data: { initName: initCall.name },
                            messageId: 'initCallLast',
                            node: initCall.node,
                        });
                    }

                    if (initFunction && initCall.name !== initFunction.name) {
                        context.report({
                            data: { initName: initCall.name },
                            messageId: 'initFunctionMissing',
                            node: initCall.node,
                        });
                    }

                    if (!initFunction) {
                        context.report({
                            data: { initName: initCall.name },
                            messageId: 'initFunctionMissing',
                            node: initCall.node,
                        });
                    }
                } else if (initFunction) {
                    context.report({
                        data: { initName: initFunction.name },
                        messageId: 'initCallMissing',
                        node: initFunction.node,
                    });
                }

                for (const statement of executableStatements) {
                    context.report({
                        data: { initName },
                        messageId: 'executableStatement',
                        node: statement,
                    });
                }
            },
        };
    },
    meta: {
        docs: {
            description:
                'Require entry functions such as main() or init() to be defined first and invoked last.',
        },
        messages: {
            executableStatement:
                'Top-level executable statements are not allowed. Move this into {{initName}}().',
            initCallLast:
                "Initialization call to '{{initName}}' must be the last statement in the file.",
            initCallMissing:
                "Initialization function '{{initName}}' must be invoked at the bottom of the file.",
            initFunctionFirst:
                "Initialization function '{{initName}}' should be defined before helper function '{{helperName}}'.",
            initFunctionMissing:
                "Initialization function '{{initName}}' must be defined.",
            multipleInitCalls:
                'Only one initialization call is allowed for the configured entry function names.',
            multipleInitFunctions:
                'Only one initialization function is allowed for the configured entry function names.',
        },
        schema: [
            {
                additionalProperties: false,
                properties: {
                    names: {
                        items: {
                            type: 'string',
                        },
                        minItems: 1,
                        type: 'array',
                    },
                },
                type: 'object',
            },
        ],
        type: 'suggestion',
    },
};

function getCalleeIdentifierName(callee: AnyValue): null | string {
    const resolvedCallee = unwrapExpression(callee);
    if (resolvedCallee?.type !== 'Identifier') {
        return null;
    }

    return resolvedCallee.name;
}

function getFunctionDeclarations(statement: AnyValue): AnyValue[] {
    const declaration = getModuleFunctionDeclaration(statement);
    if (!declaration?.id?.name) {
        return [];
    }

    return [
        {
            name: declaration.id.name,
            node: declaration,
        },
    ];
}

function getInitCallName(
    statement: AnyValue,
    initNames: Set<string>,
): null | string {
    if (statement.type !== 'ExpressionStatement') {
        return null;
    }

    return getInitCallNameFromExpression(statement.expression, initNames);
}

function getInitCallNameFromExpression(
    expression: AnyValue,
    initNames: Set<string>,
): null | string {
    if (!expression) {
        return null;
    }

    const unwrapped = unwrapExpression(expression);
    if (!unwrapped) {
        return null;
    }

    if (unwrapped.type === 'AwaitExpression') {
        return getInitCallNameFromExpression(unwrapped.argument, initNames);
    }

    if (unwrapped.type === 'UnaryExpression' && unwrapped.operator === 'void') {
        return getInitCallNameFromExpression(unwrapped.argument, initNames);
    }

    if (unwrapped.type !== 'CallExpression') {
        return null;
    }

    const directName = getCalleeIdentifierName(unwrapped.callee);
    if (directName && isFunctionInitializer(directName, initNames)) {
        return directName;
    }

    if (unwrapped.callee.type === 'MemberExpression') {
        return getInitCallNameFromExpression(
            unwrapped.callee.object,
            initNames,
        );
    }

    return null;
}

function getModuleFunctionDeclaration(statement: AnyValue): AnyValue {
    if (statement.type === 'FunctionDeclaration') {
        return statement;
    }

    if (
        statement.type === 'ExportNamedDeclaration' &&
        statement.declaration?.type === 'FunctionDeclaration'
    ) {
        return statement.declaration;
    }

    if (
        statement.type === 'ExportDefaultDeclaration' &&
        statement.declaration?.type === 'FunctionDeclaration'
    ) {
        return statement.declaration;
    }

    return null;
}

function isExecutableStatement(statement: AnyValue): boolean {
    if (statement.type === 'ImportDeclaration') {
        return false;
    }

    if (statement.type === 'ExportNamedDeclaration') {
        if (!statement.declaration) {
            return false;
        }
        return isExecutableStatement(statement.declaration);
    }

    if (statement.type === 'ExportDefaultDeclaration') {
        const declaration = statement.declaration;
        if (!declaration) {
            return false;
        }
        if (
            declaration.type === 'ClassDeclaration' ||
            declaration.type === 'FunctionDeclaration' ||
            declaration.type === 'Identifier'
        ) {
            return false;
        }
        return true;
    }

    switch (statement.type) {
        case 'ClassDeclaration':
        case 'FunctionDeclaration':
        case 'TSDeclareFunction':
        case 'TSEnumDeclaration':
        case 'TSImportEqualsDeclaration':
        case 'TSInterfaceDeclaration':
        case 'TSModuleDeclaration':
        case 'TSTypeAliasDeclaration':
        case 'VariableDeclaration':
            return false;
        default:
            return true;
    }
}

function isFunctionInitializer(name: string, initNames: Set<string>): boolean {
    return initNames.has(name);
}

function readInitNames(option: InitAtBottomOptions | undefined): Set<string> {
    const configuredNames = option?.names?.filter((name) => name.trim() !== '');
    if (!configuredNames || configuredNames.length === 0) {
        return new Set(['init', 'main']);
    }

    return new Set(configuredNames);
}

function unwrapExpression(node: AnyValue): AnyValue {
    if (!node) {
        return null;
    }

    if (node.type === 'ChainExpression') {
        return unwrapExpression(node.expression);
    }

    if (
        node.type === 'TSAsExpression' ||
        node.type === 'TSNonNullExpression' ||
        node.type === 'TSTypeAssertion'
    ) {
        return unwrapExpression(node.expression);
    }

    return node;
}
