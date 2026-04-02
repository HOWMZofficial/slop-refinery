import type { Rule } from 'eslint';

import fs from 'node:fs';
import path from 'node:path';

type NormalizePattern = {
    pattern: string;
    replacement: string;
};

type RuleOption = {
    counterpartFile: string;
    normalizePatterns: NormalizePattern[];
};

function getNormalizePatterns(option: object): NormalizePattern[] {
    const normalizePatterns = Reflect.get(option, 'normalizePatterns');

    if (!Array.isArray(normalizePatterns)) {
        return [];
    }

    return normalizePatterns.flatMap((normalizePattern) => {
        if (normalizePattern === null || typeof normalizePattern !== 'object') {
            return [];
        }

        const pattern = Reflect.get(normalizePattern, 'pattern');
        const replacement = Reflect.get(normalizePattern, 'replacement');

        if (typeof pattern !== 'string' || typeof replacement !== 'string') {
            return [];
        }

        return [{ pattern, replacement }];
    });
}

function getRuleOption(options: readonly unknown[]): null | RuleOption {
    const [option] = options;

    if (option === null || typeof option !== 'object') {
        return null;
    }

    const counterpartFile = Reflect.get(option, 'counterpartFile');

    if (typeof counterpartFile !== 'string') {
        return null;
    }

    return {
        counterpartFile,
        normalizePatterns: getNormalizePatterns(option),
    };
}

function readCounterpartText(counterpartFilePath: string): null | string {
    try {
        return fs.readFileSync(counterpartFilePath, 'utf8');
    } catch {
        return null;
    }
}

function normalizeText(
    text: string,
    normalizePatterns: NormalizePattern[],
): string {
    return normalizePatterns.reduce(
        (currentText, { pattern, replacement }) =>
            currentText.split(pattern).join(replacement),
        text,
    );
}

export const requireIdenticalFilesRule: Rule.RuleModule = {
    create(context) {
        return {
            Program(node): void {
                const ruleOption = getRuleOption(context.options);

                if (ruleOption === null) {
                    context.report({
                        messageId: 'missingOption',
                        node,
                    });
                    return;
                }

                const { counterpartFile, normalizePatterns } = ruleOption;
                const currentFilePath = context.filename;

                if (currentFilePath.startsWith('<')) {
                    return;
                }

                const counterpartFilePath = path.resolve(
                    path.dirname(currentFilePath),
                    counterpartFile,
                );
                const counterpartText =
                    readCounterpartText(counterpartFilePath);

                if (counterpartText === null) {
                    context.report({
                        data: {
                            counterpartFile,
                        },
                        messageId: 'missingCounterpart',
                        node,
                    });
                    return;
                }

                const sourceText = normalizeText(
                    context.sourceCode.text,
                    normalizePatterns,
                );
                const normalizedCounterpartText = normalizeText(
                    counterpartText,
                    normalizePatterns,
                );

                if (sourceText === normalizedCounterpartText) {
                    return;
                }

                context.report({
                    data: {
                        counterpartFile,
                    },
                    messageId: 'differentContents',
                    node,
                });
            },
        };
    },
    meta: {
        docs: {
            description:
                'Require a file to stay exactly identical to a configured counterpart file.',
        },
        messages: {
            differentContents:
                'This file must stay exactly identical to "{{counterpartFile}}".',
            missingCounterpart:
                'The counterpart file "{{counterpartFile}}" could not be read.',
            missingOption: 'The "counterpartFile" option is required.',
        },
        schema: [
            {
                additionalProperties: false,
                properties: {
                    counterpartFile: {
                        minLength: 1,
                        type: 'string',
                    },
                    normalizePatterns: {
                        items: {
                            additionalProperties: false,
                            properties: {
                                pattern: {
                                    minLength: 1,
                                    type: 'string',
                                },
                                replacement: {
                                    type: 'string',
                                },
                            },
                            required: ['pattern', 'replacement'],
                            type: 'object',
                        },
                        type: 'array',
                    },
                },
                required: ['counterpartFile'],
                type: 'object',
            },
        ],
        type: 'problem',
    },
};
