import { nodeVersionAlignmentRule } from '../src/eslint-plugin/rules/node-version-alignment.ts';
import textEslintParser from '../src/eslint-plugin/text-eslint-parser.ts';
import { createTextRuleTester, repoPath } from './test-harness.ts';

type InvalidCase = {
    code: string;
    errors: Array<{ messageId: string }>;
    filename: string;
};

type ValidCase = {
    code: string;
    filename: string;
};

const dependabotPath = repoPath('.github', 'dependabot.yml');
const packageJsonPath = repoPath('package.json');
const ruleTester = createTextRuleTester(textEslintParser);
const workflowPath = repoPath(
    '.github',
    'workflows',
    'pull-request-checks.yml',
);
const invalidCases: InvalidCase[] = [
    {
        code: '{',
        errors: [{ messageId: 'invalidPackageJson' }],
        filename: packageJsonPath,
    },
    invalidPackageCase(
        {
            devDependencies: {
                '@types/node': '^24',
            },
        },
        'missingNodeEngine',
    ),
    invalidPackageCase(
        {
            devDependencies: {
                '@types/node': '^24',
            },
            engines: {
                node: 24,
            },
        },
        'invalidNodeEngine',
    ),
    invalidPackageCase(
        {
            devDependencies: {
                '@types/node': '^24',
            },
            engines: {
                node: '^24',
            },
        },
        'invalidNodeEngine',
    ),
    invalidPackageCase(
        {
            devDependencies: {},
            engines: {
                node: '24',
            },
        },
        'mismatchedNodeTypes',
    ),
    invalidPackageCase(
        {
            devDependencies: {
                '@types/node': '^24.0.0',
            },
            engines: {
                node: '24',
            },
        },
        'mismatchedNodeTypes',
    ),
    invalidPackageCase(
        {
            devDependencies: {
                '@types/node': '^25',
            },
            engines: {
                node: '24',
            },
        },
        'mismatchedNodeTypes',
    ),
    invalidWorkflowCase("node-version: '25'"),
    invalidWorkflowCase("node-version: '24.0.0'"),
    {
        code: `
version: 2

updates:
    - package-ecosystem: npm
      directory: /
      schedule:
          interval: weekly
`,
        errors: [{ messageId: 'missingDependabotNodeTypesMajorIgnore' }],
        filename: dependabotPath,
    },
];
const validCases: ValidCase[] = [
    validPackageCase({
        devDependencies: {
            '@types/node': '^24',
        },
        engines: {
            node: '24',
        },
    }),
    validPackageCase({
        dependencies: {
            eslint: '^10.0.0',
        },
        devDependencies: {
            '@types/node': '^24',
            typescript: '^6.0.0',
        },
        engines: {
            node: '24',
        },
    }),
    validPackageCase({
        devDependencies: {
            '@types/node': '^24',
        },
        engines: {
            node: '24',
        },
        scripts: {
            lint: 'eslint .',
        },
    }),
    validWorkflowCase("node-version: '24'"),
    validWorkflowCase('node-version: 24'),
    {
        code: `
name: Pull Request Checks

jobs:
    checks:
        steps:
            - run: npm ci
`,
        filename: workflowPath,
    },
    validWorkflowCase('node-version: 24 # Keep this aligned to package.json.'),
    {
        code: `
version: 2

updates:
    - package-ecosystem: npm
      directory: /
      ignore:
          - dependency-name: '@types/node'
            update-types:
                - 'version-update:semver-major'
`,
        filename: dependabotPath,
    },
    {
        code: `
version: 2

updates:
    - package-ecosystem: "npm"
      directory: /
      ignore:
          - dependency-name: "@types/node"
            update-types:
                - "version-update:semver-major"
`,
        filename: dependabotPath,
    },
    {
        code: `
version: 2

updates:
    - package-ecosystem: github-actions
      directory: /

    - package-ecosystem: npm
      directory: /
      ignore:
          - dependency-name: '@types/node'
            update-types:
                - 'version-update:semver-major'
`,
        filename: dependabotPath,
    },
];

function invalidPackageCase(
    packageJson: Record<string, unknown>,
    messageId: string,
): InvalidCase {
    return {
        code: formatPackageJson(packageJson),
        errors: [{ messageId }],
        filename: packageJsonPath,
    };
}

function invalidWorkflowCase(nodeVersionLine: string): InvalidCase {
    return {
        code: formatWorkflow(nodeVersionLine),
        errors: [{ messageId: 'mismatchedWorkflowNodeVersion' }],
        filename: workflowPath,
    };
}

function validPackageCase(packageJson: Record<string, unknown>): ValidCase {
    return {
        code: formatPackageJson(packageJson),
        filename: packageJsonPath,
    };
}

function validWorkflowCase(nodeVersionLine: string): ValidCase {
    return {
        code: formatWorkflow(nodeVersionLine),
        filename: workflowPath,
    };
}

function formatPackageJson(packageJson: Record<string, unknown>): string {
    return JSON.stringify(packageJson, null, 4);
}

function formatWorkflow(nodeVersionLine: string): string {
    return `
name: Pull Request Checks

jobs:
    checks:
        steps:
            - uses: actions/setup-node@v6
              with:
                  ${nodeVersionLine}
`;
}

ruleTester.run('node-version-alignment', nodeVersionAlignmentRule, {
    invalid: invalidCases,
    valid: validCases,
});
