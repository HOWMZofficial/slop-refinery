type Position = {
    column: number;
    line: number;
};

type ProgramNode = {
    body: [];
    comments: [];
    loc: {
        end: Position;
        start: Position;
    };
    range: [number, number];
    sourceType: 'script';
    tokens: [];
    type: 'Program';
};

const textEslintParser = {
    parseForESLint(sourceText: string): { ast: ProgramNode } {
        return {
            ast: createEmptyProgram(sourceText),
        };
    },
};

export default textEslintParser;

function createEmptyProgram(sourceText: string): ProgramNode {
    return {
        body: [],
        comments: [],
        loc: {
            end: getLocFromIndex(sourceText, sourceText.length),
            start: {
                column: 0,
                line: 1,
            },
        },
        range: [0, sourceText.length],
        sourceType: 'script',
        tokens: [],
        type: 'Program',
    };
}

function getLocFromIndex(sourceText: string, index: number): Position {
    const linesBeforeIndex = sourceText.slice(0, index).split('\n');
    const lastLineBeforeIndex = linesBeforeIndex.at(-1) ?? '';

    return {
        column: lastLineBeforeIndex.length,
        line: linesBeforeIndex.length,
    };
}
