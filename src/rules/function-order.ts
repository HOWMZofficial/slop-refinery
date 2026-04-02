import type { Rule } from 'eslint';

type AnyValue = any;

export const functionOrderRule: Rule.RuleModule = {
    create(context: AnyValue) {
        return {
            'Program:exit'(node: AnyValue) {
                const sourceCode = context.getSourceCode();
                const functionInfos = collectModuleFunctionInfos(node);

                if (functionInfos.length < 2) {
                    return;
                }

                const functionInfoByName = new Map(
                    functionInfos.map((info: AnyValue) => [info.name, info]),
                );
                const functionNames = new Set(
                    functionInfos.map((info: AnyValue) => info.name),
                );
                const exportedNames = collectExportedFunctionNames(node);
                const topLevelCallNames = new Set(
                    collectTopLevelCallNames(node, sourceCode),
                );
                const mainFunctionNames = new Set(
                    [...exportedNames, ...topLevelCallNames].filter(
                        (name: string) => functionNames.has(name),
                    ),
                );
                const callGraph = buildCallGraph(
                    functionInfos,
                    sourceCode,
                    functionNames,
                );
                const expectedOrder = buildExpectedFunctionOrder(
                    functionInfos,
                    mainFunctionNames,
                    callGraph,
                );
                const violations = findFunctionOrderViolations(
                    expectedOrder,
                    functionInfos,
                );

                for (const violation of violations) {
                    const functionInfo = functionInfoByName.get(violation.name);
                    if (!functionInfo) {
                        continue;
                    }

                    context.report({
                        data: {
                            expectedAfter: violation.expectedAfter,
                            functionName: violation.name,
                        },
                        messageId: 'outOfOrder',
                        node: functionInfo.node.id ?? functionInfo.node,
                    });
                }
            },
        };
    },
    meta: {
        docs: {
            description:
                'Order module-level functions by: (1) "main" functions = exported + top-level-called functions, in file-call order; (2) for each main, append direct callees depth-first, pre-order, skipping other mains and already-seen functions; (3) append any remaining functions in their existing file order.',
        },
        messages: {
            outOfOrder:
                "Function '{{functionName}}' should be defined after '{{expectedAfter}}'.",
        },
        schema: [],
        type: 'suggestion',
    },
};

function addHelperFunctionsInOrder(
    functionName: string,
    callGraph: Map<string, string[]>,
    mainFunctionNames: Set<string>,
    seenNames: Set<string>,
    visiting: Set<string>,
    expectedOrder: string[],
): void {
    if (visiting.has(functionName)) {
        return;
    }

    visiting.add(functionName);
    const callees = callGraph.get(functionName) ?? [];

    for (const calleeName of callees) {
        if (mainFunctionNames.has(calleeName)) {
            continue;
        }

        if (!seenNames.has(calleeName)) {
            expectedOrder.push(calleeName);
            seenNames.add(calleeName);
        }

        addHelperFunctionsInOrder(
            calleeName,
            callGraph,
            mainFunctionNames,
            seenNames,
            visiting,
            expectedOrder,
        );
    }

    visiting.delete(functionName);
}

function buildCallGraph(
    functionInfos: AnyValue[],
    sourceCode: AnyValue,
    functionNames: Set<string>,
): Map<string, string[]> {
    const callGraph = new Map<string, string[]>();

    for (const functionInfo of functionInfos) {
        const callees = collectFunctionCallNames(
            functionInfo.node,
            sourceCode,
            functionNames,
        );
        callGraph.set(functionInfo.name, callees);
    }

    return callGraph;
}

function buildExpectedFunctionOrder(
    functionInfos: AnyValue[],
    mainFunctionNames: Set<string>,
    callGraph: Map<string, string[]>,
): string[] {
    const expectedOrder: string[] = [];
    const seenNames = new Set<string>();
    const mainFunctionInfos = functionInfos.filter((info: AnyValue) => {
        return mainFunctionNames.has(info.name);
    });

    for (const functionInfo of mainFunctionInfos) {
        expectedOrder.push(functionInfo.name);
        seenNames.add(functionInfo.name);
    }

    const visiting = new Set<string>();
    for (const functionInfo of mainFunctionInfos) {
        addHelperFunctionsInOrder(
            functionInfo.name,
            callGraph,
            mainFunctionNames,
            seenNames,
            visiting,
            expectedOrder,
        );
    }

    for (const functionInfo of functionInfos) {
        if (!seenNames.has(functionInfo.name)) {
            expectedOrder.push(functionInfo.name);
            seenNames.add(functionInfo.name);
        }
    }

    return expectedOrder;
}

function collectCallExpressions(
    rootNode: AnyValue,
    sourceCode: AnyValue,
): AnyValue[] {
    const callExpressions: AnyValue[] = [];
    const visitor = (node: AnyValue) => {
        if (isFunctionLikeNode(node)) {
            return 'skip';
        }

        if (node.type === 'CallExpression') {
            callExpressions.push(node);
        }

        return 'continue';
    };

    walkNode(rootNode, visitor);

    return callExpressions.sort((left, right) => {
        return (
            getNodeStartIndex(sourceCode, left) -
            getNodeStartIndex(sourceCode, right)
        );
    });
}

function collectExportedFunctionNames(programNode: AnyValue): Set<string> {
    const exportedNames = new Set<string>();

    for (const statement of programNode.body) {
        if (
            statement.type === 'ExportNamedDeclaration' &&
            statement.declaration?.type === 'FunctionDeclaration' &&
            statement.declaration.id?.name
        ) {
            exportedNames.add(statement.declaration.id.name);
        }

        if (statement.type === 'ExportNamedDeclaration') {
            for (const specifier of statement.specifiers) {
                if (specifier.local?.type === 'Identifier') {
                    exportedNames.add(specifier.local.name);
                }
            }
        }

        if (statement.type === 'ExportDefaultDeclaration') {
            const declaration = statement.declaration;
            if (declaration?.type === 'Identifier') {
                exportedNames.add(declaration.name);
            }
            if (
                declaration?.type === 'FunctionDeclaration' &&
                declaration.id?.name
            ) {
                exportedNames.add(declaration.id.name);
            }
        }
    }

    return exportedNames;
}

function collectFunctionCallNames(
    functionNode: AnyValue,
    sourceCode: AnyValue,
    functionNames: Set<string>,
): string[] {
    const callExpressions = collectCallExpressions(
        functionNode.body,
        sourceCode,
    );
    const callees: string[] = [];
    const seenNames = new Set<string>();
    const functionName = functionNode.id?.name;

    for (const callExpression of callExpressions) {
        const calleeName = getCalleeIdentifierName(callExpression.callee);
        if (!calleeName || calleeName === functionName) {
            continue;
        }

        if (!functionNames.has(calleeName) || seenNames.has(calleeName)) {
            continue;
        }

        callees.push(calleeName);
        seenNames.add(calleeName);
    }

    return callees;
}

function collectModuleFunctionInfos(programNode: AnyValue): AnyValue[] {
    return programNode.body
        .map((statement: AnyValue) => getModuleFunctionDeclaration(statement))
        .filter((declaration: AnyValue) => declaration?.id?.name)
        .map((declaration: AnyValue) => ({
            name: declaration.id.name,
            node: declaration,
        }));
}

function collectTopLevelCallNames(
    programNode: AnyValue,
    sourceCode: AnyValue,
): string[] {
    const callExpressions = collectCallExpressions(programNode, sourceCode);
    const topLevelCallNames: string[] = [];
    const seenNames = new Set<string>();

    for (const callExpression of callExpressions) {
        const calleeName = getCalleeIdentifierName(callExpression.callee);
        if (!calleeName || seenNames.has(calleeName)) {
            continue;
        }

        topLevelCallNames.push(calleeName);
        seenNames.add(calleeName);
    }

    return topLevelCallNames;
}

function findFunctionOrderViolations(
    expectedOrder: string[],
    functionInfos: AnyValue[],
): Array<{ expectedAfter: string; name: string }> {
    if (expectedOrder.length === 0) {
        return [];
    }

    const actualIndexByName = new Map<string, number>(
        functionInfos.map((info: AnyValue, index: number) => [
            info.name,
            index,
        ]),
    );
    const violations: Array<{ expectedAfter: string; name: string }> = [];
    const [firstName, ...remainingNames] = expectedOrder;
    if (firstName === undefined) {
        return [];
    }
    const firstIndex = actualIndexByName.get(firstName);
    if (firstIndex === undefined) {
        return [];
    }

    let lastExpectedName = firstName;
    let lastExpectedIndex = firstIndex;

    for (const name of remainingNames) {
        const actualIndex = actualIndexByName.get(name);
        if (actualIndex === undefined) {
            continue;
        }

        if (actualIndex < lastExpectedIndex) {
            violations.push({ expectedAfter: lastExpectedName, name });
            continue;
        }

        lastExpectedName = name;
        lastExpectedIndex = actualIndex;
    }

    return violations;
}

function getCalleeIdentifierName(callee: AnyValue): null | string {
    const resolvedCallee = unwrapExpression(callee);
    if (resolvedCallee?.type !== 'Identifier') {
        return null;
    }

    return resolvedCallee.name;
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

function getNodeStartIndex(sourceCode: AnyValue, node: AnyValue): number {
    if (Array.isArray(node?.range) && typeof node.range[0] === 'number') {
        return node.range[0];
    }

    if (!node?.loc) {
        return 0;
    }

    return sourceCode.getIndexFromLoc(node.loc.start);
}

function isFunctionLikeNode(node: AnyValue): boolean {
    return (
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression'
    );
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

function walkNode(
    node: AnyValue,
    visitor: (node: AnyValue) => 'continue' | 'skip',
): void {
    if (!node || typeof node.type !== 'string') {
        return;
    }

    const visitorResult = visitor(node);
    if (visitorResult === 'skip') {
        return;
    }

    for (const [key, value] of Object.entries(node as Record<string, any>)) {
        if (key === 'comments' || key === 'parent' || key === 'tokens') {
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value as AnyValue[]) {
                if (item && typeof (item as AnyValue).type === 'string') {
                    walkNode(item, visitor);
                }
            }
            continue;
        }

        if (value && typeof (value as AnyValue).type === 'string') {
            walkNode(value, visitor);
        }
    }
}
