import { reactComponentNameRule } from '../src/rules/react-component-name.ts';
import { createTypeScriptRuleTester, repoPath } from './test-harness.ts';

const ruleTester = createTypeScriptRuleTester();

ruleTester.run('react-component-name', reactComponentNameRule, {
    invalid: [
        {
            code: 'export function pulseApp(): ReactElement { return <div />; }',
            errors: [{ messageId: 'invalidComponentName' }],
            filename: repoPath('src', 'frontend', 'app-shell', 'PulseApp.tsx'),
        },
        {
            code: 'export function issueCard(): ReactElement { return <div />; }',
            errors: [{ messageId: 'invalidComponentName' }],
            filename: repoPath(
                'src',
                'frontend',
                'issues',
                'PulseIssueList.tsx',
            ),
        },
        {
            code: 'export class pulseModelViewer extends Component<Props> { render(): ReactElement { return <div />; } }',
            errors: [{ messageId: 'invalidComponentName' }],
            filename: repoPath(
                'src',
                'frontend',
                'work-instructions',
                'PulseModelViewer.tsx',
            ),
        },
        {
            code: 'const howmzAlert = (): ReactElement => <div />;\nexport { howmzAlert };',
            errors: [{ messageId: 'invalidComponentName' }],
            filename: repoPath(
                'src',
                'frontend',
                'design-system',
                'HowmzAlert.tsx',
            ),
        },
        {
            code: 'const modal_header = (): JSX.Element => <div />;\nexport { modal_header };',
            errors: [{ messageId: 'invalidComponentName' }],
            filename: repoPath(
                'src',
                'frontend',
                'design-system',
                'HowmzModal.tsx',
            ),
        },
    ],
    valid: [
        {
            code: 'export function PulseApp(): ReactElement { return <div />; }',
            filename: repoPath('src', 'frontend', 'app-shell', 'PulseApp.tsx'),
        },
        {
            code: 'function IssueCard(): ReactElement { return <div />; }\nexport function PulseIssueList(): ReactElement { return <IssueCard />; }',
            filename: repoPath(
                'src',
                'frontend',
                'issues',
                'PulseIssueList.tsx',
            ),
        },
        {
            code: 'export class PulseModelViewer extends Component<Props> { render(): ReactElement { return <div />; } }',
            filename: repoPath(
                'src',
                'frontend',
                'work-instructions',
                'PulseModelViewer.tsx',
            ),
        },
        {
            code: 'const HowmzAlert = (): ReactElement => <div />;\nexport { HowmzAlert };',
            filename: repoPath(
                'src',
                'frontend',
                'design-system',
                'HowmzAlert.tsx',
            ),
        },
        {
            code: 'export const value = 1;',
            filename: repoPath('src', 'frontend', 'app-shell', 'router.ts'),
        },
    ],
});
