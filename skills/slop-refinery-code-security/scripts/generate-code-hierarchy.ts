import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type CliOptions = {
    outputPath: null | string;
    rigor: Rigor;
    sourcePath: string;
};

type CliOptionsCandidate = {
    outputPath: null | string;
    rigor: null | Rigor;
    sourcePath: null | string;
};

type Rigor = 'directory' | 'file' | 'function' | 'statement';

type HierarchyNode = {
    children: HierarchyNode[];
    label: string;
};

const INTERNAL_LABEL_BY_STATEMENT_KIND = new Map<ts.SyntaxKind, string>([
    [ts.SyntaxKind.Block, 'Internal block'],
    [ts.SyntaxKind.BreakStatement, 'Internal break statement'],
    [ts.SyntaxKind.ContinueStatement, 'Internal continue statement'],
    [ts.SyntaxKind.DoStatement, 'Internal do-while statement'],
    [ts.SyntaxKind.ForInStatement, 'Internal for-in statement'],
    [ts.SyntaxKind.ForOfStatement, 'Internal for-of statement'],
    [ts.SyntaxKind.ForStatement, 'Internal for statement'],
    [ts.SyntaxKind.IfStatement, 'Internal if statement'],
    [ts.SyntaxKind.ReturnStatement, 'Internal return statement'],
    [ts.SyntaxKind.SwitchStatement, 'Internal switch statement'],
    [ts.SyntaxKind.ThrowStatement, 'Internal throw statement'],
    [ts.SyntaxKind.TryStatement, 'Internal try statement'],
    [ts.SyntaxKind.WhileStatement, 'Internal while statement'],
]);

const HELP_TEXT = `Generate deterministic checkbox hierarchies from filesystem traversal + AST analysis.

Usage:
  npx tsx <path-to-slop-refinery-code-security-skill>/scripts/generate-code-hierarchy.ts --source <path> [options]

Required:
  --source <path>                            Directory or file to analyze

Options:
  --rigor <level>                            Output depth: directory | file | function | statement
  --output <path>                            Write output to file (defaults to stdout)
  --help                                     Print help
`;

function main(): void {
    try {
        const options = parseCliOptions(process.argv.slice(2));
        const cwd = process.cwd();
        const sourceAbsolutePath = resolveSourcePath(options.sourcePath, cwd);
        const hierarchyNodes = buildHierarchyNodes(
            sourceAbsolutePath,
            cwd,
            options.rigor,
        );

        if (hierarchyNodes.length === 0) {
            throw new Error(
                `No source files found for hierarchy generation at "${options.sourcePath}".`,
            );
        }

        const output = renderHierarchy(hierarchyNodes);

        writeOutput(output, options.outputPath, cwd);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Unknown script failure';
        console.error(message);
        process.exit(1);
    }
}

function parseCliOptions(argv: string[]): CliOptions {
    return finalizeCliOptions(
        parseCliArgumentsRecursively(argv, 0, {
            outputPath: null,
            rigor: null,
            sourcePath: null,
        }),
    );
}

function finalizeCliOptions(options: CliOptionsCandidate): CliOptions {
    const sourcePath = options.sourcePath;
    if (sourcePath === null || sourcePath.trim() === '') {
        throw new Error('Missing required argument --source <path>.');
    }

    const rigor = options.rigor ?? 'statement';

    return {
        outputPath: options.outputPath,
        rigor,
        sourcePath,
    };
}

function parseCliArgumentsRecursively(
    argv: string[],
    index: number,
    options: CliOptionsCandidate,
): CliOptionsCandidate {
    if (index >= argv.length) {
        return options;
    }

    const [nextIndex, nextOptions] = parseArgumentAtIndex(argv, index, options);
    return parseCliArgumentsRecursively(argv, nextIndex, nextOptions);
}

function parseArgumentAtIndex(
    argv: string[],
    index: number,
    options: CliOptionsCandidate,
): [number, CliOptionsCandidate] {
    const argument = argv[index];

    switch (argument) {
        case '--help': {
            return printHelpAndExit();
        }
        case '--output': {
            return [
                index + 2,
                {
                    ...options,
                    outputPath: readRequiredValue(argument, argv[index + 1]),
                },
            ];
        }
        case '--rigor': {
            return [
                index + 2,
                {
                    ...options,
                    rigor: parseRigor(
                        readRequiredValue(argument, argv[index + 1]),
                    ),
                },
            ];
        }
        case '--source': {
            return [
                index + 2,
                {
                    ...options,
                    sourcePath: readRequiredValue(argument, argv[index + 1]),
                },
            ];
        }
        default: {
            throw new Error(
                `Unsupported argument "${argument}". Use --help for usage.`,
            );
        }
    }
}

function printHelpAndExit(): never {
    console.log(HELP_TEXT);
    process.exit(0);
}

function readRequiredValue(
    argument: string,
    nextValue: string | undefined,
): string {
    if (nextValue === undefined) {
        throw new Error(`Missing value for ${argument}.`);
    }
    return nextValue;
}

function parseRigor(value: string): Rigor {
    switch (value) {
        case 'directory':
        case 'file':
        case 'function':
        case 'statement':
            return value;
        default:
            throw new Error(
                `Unsupported rigor "${value}". Expected one of: directory, file, function, statement.`,
            );
    }
}

function resolveSourcePath(sourcePath: string, cwd: string): string {
    const sourceAbsolutePath = path.resolve(cwd, sourcePath);
    if (!fs.existsSync(sourceAbsolutePath)) {
        throw new Error(`Source path does not exist: ${sourceAbsolutePath}`);
    }
    return sourceAbsolutePath;
}

function buildHierarchyNodes(
    sourceAbsolutePath: string,
    cwd: string,
    rigor: Rigor,
): HierarchyNode[] {
    const sourceStats = fs.statSync(sourceAbsolutePath);

    if (sourceStats.isDirectory()) {
        const rootDirectoryNode = buildDirectoryNode(
            sourceAbsolutePath,
            cwd,
            rigor,
        );
        return rootDirectoryNode === null ? [] : [rootDirectoryNode];
    }

    if (sourceStats.isFile()) {
        if (rigor === 'directory') {
            return [
                {
                    children: [],
                    label: `Directory ${toDisplayPath(
                        path.dirname(sourceAbsolutePath),
                        cwd,
                    )}`,
                },
            ];
        }

        const fileNode = buildFileNode(sourceAbsolutePath, cwd, rigor);
        return [
            {
                children: [fileNode],
                label: `Directory ${toDisplayPath(
                    path.dirname(sourceAbsolutePath),
                    cwd,
                )}`,
            },
        ];
    }

    throw new Error(
        `Source path must be a file or directory: ${sourceAbsolutePath}`,
    );
}

function buildDirectoryNode(
    directoryPath: string,
    cwd: string,
    rigor: Rigor,
): HierarchyNode | null {
    const directoryEntries = listSortedDirectoryEntries(directoryPath);
    const childDirectoryNodes = directoryEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
            buildDirectoryNode(
                path.join(directoryPath, entry.name),
                cwd,
                rigor,
            ),
        )
        .filter((node): node is HierarchyNode => node !== null);
    const childFileNodes =
        rigor === 'directory'
            ? []
            : directoryEntries
                  .filter((entry) => entry.isFile())
                  .map((entry) =>
                      buildFileNode(
                          path.join(directoryPath, entry.name),
                          cwd,
                          rigor,
                      ),
                  );
    const children = [...childDirectoryNodes, ...childFileNodes];

    if (rigor === 'directory') {
        return {
            children: childDirectoryNodes,
            label: `Directory ${toDisplayPath(directoryPath, cwd)}`,
        };
    }

    return children.length === 0
        ? null
        : {
              children,
              label: `Directory ${toDisplayPath(directoryPath, cwd)}`,
          };
}

function listSortedDirectoryEntries(directoryPath: string): fs.Dirent[] {
    return fs
        .readdirSync(directoryPath, { withFileTypes: true })
        .sort((leftEntry, rightEntry) =>
            leftEntry.name.localeCompare(rightEntry.name),
        );
}

function toDisplayPath(absolutePath: string, cwd: string): string {
    const relativePath = path.relative(cwd, absolutePath);
    return relativePath === '' ? '.' : relativePath.split(path.sep).join('/');
}

function buildFileNode(
    filePath: string,
    cwd: string,
    rigor: Rigor,
): HierarchyNode {
    const includeStatements = rigor === 'statement';

    return {
        children:
            rigor === 'function' || rigor === 'statement'
                ? buildFunctionNodes(filePath, includeStatements)
                : [],
        label: `File ${toDisplayPath(filePath, cwd)}`,
    };
}

function buildFunctionNodes(
    filePath: string,
    includeStatements: boolean,
): HierarchyNode[] {
    const scriptKind = detectScriptKind(filePath);
    if (scriptKind === null) {
        return [];
    }

    const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        scriptKind,
    );

    return sourceFile.statements.flatMap((statement) =>
        buildFunctionNodesFromTopLevelStatement(statement, includeStatements),
    );
}

function detectScriptKind(filePath: string): null | ts.ScriptKind {
    switch (path.extname(filePath).toLowerCase()) {
        case '.cjs':
        case '.js':
        case '.mjs':
            return ts.ScriptKind.JS;
        case '.cts':
        case '.mts':
        case '.ts':
            return ts.ScriptKind.TS;
        case '.jsx':
            return ts.ScriptKind.JSX;
        case '.tsx':
            return ts.ScriptKind.TSX;
        default:
            return null;
    }
}

function renderHierarchy(rootNodes: HierarchyNode[]): string {
    const outputLines: string[] = [];
    appendRenderedNodes(outputLines, rootNodes, {
        depth: 0,
        parentId: null,
    });
    return `${outputLines.join('\n')}\n`;
}

function appendRenderedNodes(
    outputLines: string[],
    nodes: HierarchyNode[],
    options: {
        depth: number;
        parentId: null | string;
    },
): void {
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const nodeId =
            options.parentId === null
                ? String(index + 1)
                : `${options.parentId}.${index + 1}`;
        const indent = '    '.repeat(options.depth);

        outputLines.push(`${indent}- [ ] [${nodeId}] ${node.label}`);
        appendRenderedNodes(outputLines, node.children, {
            ...options,
            depth: options.depth + 1,
            parentId: nodeId,
        });
    }
}

function writeOutput(
    output: string,
    outputPath: null | string,
    cwd: string,
): void {
    if (outputPath === null) {
        process.stdout.write(output);
        return;
    }

    const outputAbsolutePath = path.resolve(cwd, outputPath);
    fs.mkdirSync(path.dirname(outputAbsolutePath), { recursive: true });
    fs.writeFileSync(outputAbsolutePath, output, 'utf8');
}

function buildFunctionNodesFromTopLevelStatement(
    statement: ts.Statement,
    includeStatements: boolean,
): HierarchyNode[] {
    if (ts.isFunctionDeclaration(statement)) {
        return [
            createFunctionNode(
                `Top-level function ${identifierTextOrFallback(statement.name)}`,
                statement.body,
                includeStatements,
            ),
        ];
    }

    if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.flatMap((declaration) =>
            buildFunctionNodesFromVariableDeclaration(
                declaration,
                includeStatements,
            ),
        );
    }

    if (ts.isClassDeclaration(statement)) {
        const className = identifierTextOrFallback(statement.name);
        return statement.members.flatMap((member) =>
            buildFunctionNodesFromClassMember(
                member,
                className,
                includeStatements,
            ),
        );
    }

    return [];
}

function buildFunctionNodesFromVariableDeclaration(
    declaration: ts.VariableDeclaration,
    includeStatements: boolean,
): HierarchyNode[] {
    const initializer = declaration.initializer;
    if (initializer === undefined) {
        return [];
    }

    if (
        ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer)
    ) {
        return [
            createFunctionNode(
                `Top-level function ${bindingNameToText(declaration.name)}`,
                initializer.body,
                includeStatements,
            ),
        ];
    }

    if (ts.isClassExpression(initializer)) {
        const className = bindingNameToText(declaration.name);
        return initializer.members.flatMap((member) =>
            buildFunctionNodesFromClassMember(
                member,
                className,
                includeStatements,
            ),
        );
    }

    return [];
}

function buildFunctionNodesFromClassMember(
    member: ts.ClassElement,
    className: string,
    includeStatements: boolean,
): HierarchyNode[] {
    if (ts.isConstructorDeclaration(member)) {
        return [
            createFunctionNode(
                `Top-level function ${className}.constructor`,
                member.body,
                includeStatements,
            ),
        ];
    }

    if (ts.isMethodDeclaration(member)) {
        return [
            createFunctionNode(
                `Top-level function ${className}.${propertyNameToText(member.name)}`,
                member.body,
                includeStatements,
            ),
        ];
    }

    if (ts.isGetAccessorDeclaration(member)) {
        return [
            createFunctionNode(
                `Top-level function ${className}.get ${propertyNameToText(member.name)}`,
                member.body,
                includeStatements,
            ),
        ];
    }

    if (ts.isSetAccessorDeclaration(member)) {
        return [
            createFunctionNode(
                `Top-level function ${className}.set ${propertyNameToText(member.name)}`,
                member.body,
                includeStatements,
            ),
        ];
    }

    return [];
}

function createFunctionNode(
    label: string,
    body: ts.ConciseBody | ts.FunctionBody | undefined,
    includeStatements: boolean,
): HierarchyNode {
    return {
        children: includeStatements ? blockStatementsToInternalNodes(body) : [],
        label,
    };
}

function blockStatementsToInternalNodes(
    body: ts.ConciseBody | ts.FunctionBody | undefined,
): HierarchyNode[] {
    if (body === undefined) {
        return [];
    }

    if (ts.isBlock(body)) {
        return body.statements.map((statement) => ({
            children: [],
            label: labelInternalStatement(statement),
        }));
    }

    return [
        {
            children: [],
            label: `Internal expression body (${humanizeSyntaxKind(body.kind)})`,
        },
    ];
}

function labelInternalStatement(statement: ts.Statement): string {
    if (ts.isExpressionStatement(statement)) {
        return `Internal expression (${humanizeSyntaxKind(statement.expression.kind)})`;
    }

    if (ts.isVariableStatement(statement)) {
        return labelInternalVariableStatement(statement);
    }

    return (
        INTERNAL_LABEL_BY_STATEMENT_KIND.get(statement.kind) ??
        `Internal ${humanizeSyntaxKind(statement.kind)}`
    );
}

function labelInternalVariableStatement(
    variableStatement: ts.VariableStatement,
): string {
    const variableNames = variableStatement.declarationList.declarations.map(
        (declaration) => bindingNameToText(declaration.name),
    );

    return variableNames.length === 0
        ? 'Internal variable statement'
        : `Internal variable statement (${variableNames.join(', ')})`;
}

function bindingNameToText(bindingName: ts.BindingName): string {
    if (ts.isIdentifier(bindingName)) {
        return bindingName.text;
    }

    if (ts.isArrayBindingPattern(bindingName)) {
        return '[array destructuring]';
    }

    return '{object destructuring}';
}

function identifierTextOrFallback(
    identifier: ts.Identifier | undefined,
): string {
    return identifier?.text ?? '<anonymous>';
}

function propertyNameToText(name: ts.PropertyName | undefined): string {
    if (name === undefined) {
        return '<anonymous>';
    }

    if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
        return name.text;
    }

    if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }

    if (ts.isComputedPropertyName(name)) {
        return `[${name.expression.getText()}]`;
    }

    return name.getText();
}

function humanizeSyntaxKind(kind: ts.SyntaxKind): string {
    const syntaxKindText = ts.SyntaxKind[kind] ?? 'Unknown';
    return syntaxKindText
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

main();
