import type { Rule } from 'eslint';

import path from 'node:path';

type AnyValue = any;

export const pathCaseRule: Rule.RuleModule = {
    create(context: AnyValue) {
        return {
            Program(programNode: AnyValue) {
                const relativePath = getRelativePath(context.getFilename());
                if (relativePath === null) {
                    return;
                }

                const pathSegments = relativePath.split(path.sep);
                if (pathSegments.length === 0) {
                    return;
                }

                for (const directoryName of pathSegments.slice(0, -1)) {
                    if (
                        directoryName.startsWith('.') ||
                        isKebabCase(directoryName)
                    ) {
                        continue;
                    }

                    context.report({
                        data: { directoryName },
                        messageId: 'invalidDirectoryName',
                        node: programNode,
                    });
                }

                const fileName = pathSegments.at(-1);
                if (fileName === undefined) {
                    return;
                }

                if (isKebabCaseFileName(fileName) === true) {
                    return;
                }

                context.report({
                    data: { fileName },
                    messageId: 'invalidFileName',
                    node: programNode,
                });
            },
        };
    },
    meta: {
        docs: {
            description:
                'Require kebab-case directory names and kebab-case file names.',
        },
        messages: {
            invalidDirectoryName:
                "Directory '{{directoryName}}' must be kebab-case.",
            invalidFileName: "File '{{fileName}}' must be kebab-case.",
        },
        schema: [],
        type: 'problem',
    },
};

function getRelativePath(filename: string): null | string {
    if (
        filename.length === 0 ||
        filename === '<input>' ||
        filename === '<text>'
    ) {
        return null;
    }

    const relativePath = path.relative(process.cwd(), path.resolve(filename));
    if (
        relativePath.length === 0 ||
        relativePath.startsWith('..') ||
        path.isAbsolute(relativePath)
    ) {
        return null;
    }

    return relativePath;
}

function isKebabCase(value: string): boolean {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isKebabCaseFileName(fileName: string): boolean {
    const nameParts = fileName.split('.');
    if (nameParts.length < 2) {
        return isKebabCase(fileName);
    }

    return nameParts.slice(0, -1).every(isKebabCase);
}
