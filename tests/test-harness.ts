import { RuleTester } from 'eslint';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
} from 'vitest';

const configuredRuleTester = RuleTester as any;

configuredRuleTester.afterAll = afterAll;
configuredRuleTester.afterEach = afterEach;
configuredRuleTester.beforeAll = beforeAll;
configuredRuleTester.beforeEach = beforeEach;
configuredRuleTester.describe = describe;
configuredRuleTester.it = it;
configuredRuleTester.itOnly = it.only;
configuredRuleTester.itSkip = it.skip;

export function createTypeScriptRuleTester(): any {
    return new RuleTester({
        languageOptions: {
            ecmaVersion: 'latest',
            parser: tseslint.parser,
            sourceType: 'module',
        },
    });
}

export function repoPath(...segments: string[]): string {
    return path.join(process.cwd(), ...segments);
}
