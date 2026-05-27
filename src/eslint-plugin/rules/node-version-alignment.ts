import type { Rule } from 'eslint';

import fs from 'node:fs';
import path from 'node:path';

type AnyNode = any;
type ConfigFileKind = 'dependabot' | 'packageJson' | 'untracked' | 'workflow';
type IndexedLine = {
    index: number;
    text: string;
};
type NodeEngine = {
    major: string;
};
type NodeEngineResult =
    | {
          engine: NodeEngine;
          problem?: never;
      }
    | {
          engine?: never;
          problem: {
              actual?: string;
              messageId: 'invalidNodeEngine' | 'missingNodeEngine';
          };
      };
type PackageJson = {
    dependencies?: unknown;
    devDependencies?: unknown;
    engines?: unknown;
};
type ReportData = Record<string, string>;
type RuleContext = any;
type TextBlock = {
    start: number;
    text: string;
};

const DEPENDABOT_PATH = '.github/dependabot.yml';
const NODE_ENGINE_PATTERN = /^\d+$/u;
const NODE_TYPES_PACKAGE_NAME = '@types/node';
const NODE_VERSION_LINE_PATTERN = /^(\s*node-version:\s*)([^#]+)/u;
const WORKFLOW_PATH_PATTERN = /^\.github\/workflows\/.+\.ya?ml$/u;

export const nodeVersionAlignmentRule: Rule.RuleModule = {
    create(context: RuleContext) {
        return {
            Program(node: AnyNode) {
                checkNodeVersionAlignment(context, node);
            },
        };
    },
    meta: {
        docs: {
            description:
                'Keep Node-related package, workflow, and Dependabot versions aligned to package.json engines.node.',
        },
        messages: {
            invalidNodeEngine:
                'package.json engines.node must be a single major version like "24"; found "{{actual}}".',
            invalidPackageJson:
                'package.json must be valid JSON so Node version alignment can be checked.',
            mismatchedNodeTypes:
                'package.json devDependencies["@types/node"] must be "{{expected}}" because engines.node is "{{engine}}"; found "{{actual}}".',
            mismatchedWorkflowNodeVersion:
                'GitHub workflow node-version must be "{{expected}}" because package.json engines.node is "{{engine}}"; found "{{actual}}".',
            missingDependabotNodeTypesMajorIgnore:
                'Dependabot npm updates must ignore semver-major updates for @types/node so Node types stay aligned with engines.node "{{engine}}".',
            missingNodeEngine:
                'package.json must define engines.node as a single major version like "24".',
        },
        schema: [],
        type: 'problem',
    },
};

function checkNodeVersionAlignment(context: RuleContext, node: AnyNode): void {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const sourceText = sourceCode.text;
    const relativeFilePath = getRelativeFilePath(context.filename);
    const configFileKind = getConfigFileKind(relativeFilePath);

    if (configFileKind === 'packageJson') {
        checkPackageJson(context, node, sourceText);
        return;
    }

    const rootEngine = readRootNodeEngine();

    if (rootEngine === undefined) {
        return;
    }

    if (configFileKind === 'workflow') {
        checkWorkflowNodeVersions(context, node, sourceText, rootEngine);
        return;
    }

    if (configFileKind === 'dependabot') {
        checkDependabotNodeTypesIgnore(context, node, sourceText, rootEngine);
    }
}

function checkPackageJson(
    context: RuleContext,
    node: AnyNode,
    sourceText: string,
): void {
    const packageJson = parsePackageJson(sourceText);

    if (packageJson === undefined) {
        reportAtIndex(context, node, 0, 'invalidPackageJson');
        return;
    }

    const engineResult = readNodeEngine(packageJson);

    if (engineResult.problem !== undefined) {
        reportAtIndex(context, node, 0, engineResult.problem.messageId, {
            actual: engineResult.problem.actual ?? 'missing',
        });
        return;
    }

    const expected = getExpectedNodeTypesRange(engineResult.engine);
    const actual = getNodeTypesVersion(packageJson);

    if (actual !== expected) {
        reportAtIndex(context, node, 0, 'mismatchedNodeTypes', {
            actual: formatActualValue(actual),
            engine: engineResult.engine.major,
            expected,
        });
    }
}

function checkWorkflowNodeVersions(
    context: RuleContext,
    node: AnyNode,
    sourceText: string,
    rootEngine: NodeEngine,
): void {
    for (const line of getIndexedLines(sourceText)) {
        const nodeVersion = parseWorkflowNodeVersion(line);

        if (nodeVersion === undefined) {
            continue;
        }

        if (nodeVersion.version !== rootEngine.major) {
            reportAtIndex(
                context,
                node,
                nodeVersion.index,
                'mismatchedWorkflowNodeVersion',
                {
                    actual: nodeVersion.version,
                    engine: rootEngine.major,
                    expected: rootEngine.major,
                },
            );
        }
    }
}

function checkDependabotNodeTypesIgnore(
    context: RuleContext,
    node: AnyNode,
    sourceText: string,
    rootEngine: NodeEngine,
): void {
    const npmUpdateBlock = getDependabotNpmUpdateBlock(sourceText);

    if (
        npmUpdateBlock === undefined ||
        !hasNodeTypesMajorIgnore(npmUpdateBlock.text)
    ) {
        reportAtIndex(
            context,
            node,
            npmUpdateBlock?.start ?? 0,
            'missingDependabotNodeTypesMajorIgnore',
            {
                engine: rootEngine.major,
            },
        );
    }
}

function getRelativeFilePath(filename: string): string {
    return path.relative(process.cwd(), filename).split(path.sep).join('/');
}

function getConfigFileKind(relativeFilePath: string): ConfigFileKind {
    if (relativeFilePath === 'package.json') {
        return 'packageJson';
    }

    if (relativeFilePath === DEPENDABOT_PATH) {
        return 'dependabot';
    }

    if (WORKFLOW_PATH_PATTERN.test(relativeFilePath)) {
        return 'workflow';
    }

    return 'untracked';
}

function readRootNodeEngine(): NodeEngine | undefined {
    const packageJsonPath = path.join(process.cwd(), 'package.json');

    try {
        const packageJson = parsePackageJson(
            fs.readFileSync(packageJsonPath, 'utf8'),
        );

        return packageJson === undefined
            ? undefined
            : readNodeEngine(packageJson).engine;
    } catch {
        return undefined;
    }
}

function parsePackageJson(sourceText: string): PackageJson | undefined {
    try {
        const parsedJson: unknown = JSON.parse(sourceText);

        return isRecord(parsedJson) ? parsedJson : undefined;
    } catch {
        return undefined;
    }
}

function readNodeEngine(packageJson: PackageJson): NodeEngineResult {
    const engines = packageJson.engines;

    if (!isRecord(engines) || engines.node === undefined) {
        return {
            problem: {
                messageId: 'missingNodeEngine',
            },
        };
    }

    if (
        typeof engines.node !== 'string' ||
        !NODE_ENGINE_PATTERN.test(engines.node)
    ) {
        return {
            problem: {
                actual: formatActualValue(engines.node),
                messageId: 'invalidNodeEngine',
            },
        };
    }

    return {
        engine: {
            major: engines.node,
        },
    };
}

function getExpectedNodeTypesRange(nodeEngine: NodeEngine): string {
    return `^${nodeEngine.major}`;
}

function getNodeTypesVersion(packageJson: PackageJson): unknown {
    return isRecord(packageJson.devDependencies)
        ? packageJson.devDependencies[NODE_TYPES_PACKAGE_NAME]
        : undefined;
}

function getIndexedLines(sourceText: string): IndexedLine[] {
    const lines = sourceText.split('\n');

    return lines.map((text, lineNumber) => {
        return {
            index: getLineStartIndex(lines, lineNumber),
            text,
        };
    });
}

function getLineStartIndex(lines: string[], lineNumber: number): number {
    return lines.slice(0, lineNumber).reduce((index, line) => {
        return index + line.length + 1;
    }, 0);
}

function parseWorkflowNodeVersion(
    line: IndexedLine,
): { index: number; version: string } | undefined {
    const match = NODE_VERSION_LINE_PATTERN.exec(line.text);

    if (match === null) {
        return undefined;
    }

    return {
        index: line.index + match[1].length,
        version: normalizeYamlScalar(match[2]),
    };
}

function getDependabotNpmUpdateBlock(
    sourceText: string,
): TextBlock | undefined {
    const lines = getIndexedLines(sourceText);

    for (const [lineNumber, line] of lines.entries()) {
        const ecosystemIndent = getPackageEcosystemIndent(line.text, 'npm');

        if (ecosystemIndent === undefined) {
            continue;
        }

        const blockEnd = findNextPackageEcosystemIndex(
            lines,
            lineNumber + 1,
            ecosystemIndent,
            sourceText.length,
        );

        return {
            start: line.index,
            text: sourceText.slice(line.index, blockEnd),
        };
    }

    return undefined;
}

function getPackageEcosystemIndent(
    line: string,
    ecosystem: string,
): string | undefined {
    const pattern = new RegExp(
        `^(\\s*)-\\s*package-ecosystem:\\s*['"]?${escapeRegExp(ecosystem)}['"]?\\s*$`,
        'u',
    );
    const match = pattern.exec(line);

    return match?.[1];
}

function findNextPackageEcosystemIndex(
    lines: IndexedLine[],
    startLineNumber: number,
    ecosystemIndent: string,
    fallbackIndex: number,
): number {
    for (const line of lines.slice(startLineNumber)) {
        if (line.text.startsWith(`${ecosystemIndent}- package-ecosystem:`)) {
            return line.index;
        }
    }

    return fallbackIndex;
}

function hasNodeTypesMajorIgnore(blockText: string): boolean {
    return (
        /^\s*ignore:\s*$/mu.test(blockText) &&
        /dependency-name:\s*['"]?@types\/node['"]?/u.test(blockText) &&
        /['"]?version-update:semver-major['"]?/u.test(blockText)
    );
}

function normalizeYamlScalar(rawValue: string): string {
    const trimmedValue = rawValue.trim();

    if (
        (trimmedValue.startsWith("'") && trimmedValue.endsWith("'")) ||
        (trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))
    ) {
        return trimmedValue.slice(1, -1).trim();
    }

    return trimmedValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatActualValue(value: unknown): string {
    if (value === undefined) {
        return 'missing';
    }

    if (typeof value === 'string') {
        return value;
    }

    return JSON.stringify(value) ?? String(value);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function reportAtIndex(
    context: RuleContext,
    node: AnyNode,
    index: number,
    messageId: string,
    data?: ReportData,
): void {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const start = sourceCode.getLocFromIndex(index);
    const end = sourceCode.getLocFromIndex(index + 1);

    context.report({
        data,
        loc: {
            end,
            start,
        },
        messageId,
        node,
    });
}
