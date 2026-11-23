const fs = require('fs');
const os = require('os');
const path = require('path');

const { isCommit, commitDir, decide } = require('../../.claude/hooks/gate-before-commit.cjs');
const { evaluate } = require('../../.claude/hooks/verify-before-stop.cjs');
const { lint, configDirFor } = require('../../.claude/hooks/lint-edited-file.cjs');

const ROOT = path.resolve(__dirname, '../..');

const repoWith = scripts => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hook-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
    return root;
};

describe('gate-before-commit hook', () => {
    it.each([
        'git commit -m x',
        'git add -A && git commit -m "y"',
        'git -C apps commit --amend',
        'cd x; git commit',
        'git --no-pager commit -m x',
        'git -C "/a b" commit -m x',
        '/usr/bin/git commit -m x',
    ])('recognises %s as a commit', command => expect(isCommit(command)).toBe(true));

    it.each([
        'git status',
        'git log --grep commit',
        'echo "git commits"',
        'git commit-tree abc',
        'gh pr create --title "run git commit hooks"',
    ])('leaves %s alone', command => expect(isCommit(command)).toBe(false));

    it('gates the tree named by -C, resolved from the hook cwd', () => {
        const resolved = commitDir('git -C web commit -m x', path.join(ROOT, 'apps'));
        expect(resolved).toBe(ROOT);
    });

    it('skips with a message while package.json has no gate script', () => {
        const root = repoWith({});
        const outcome = decide(
            { tool_input: { command: 'git commit -m x' } },
            root,
            () => {
                throw new Error('must not run');
            },
            () => root
        );
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).systemMessage).toContain('yarn gate is not defined');
    });

    it('blocks the commit when the gate fails, with the tail of its output', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide(
            { tool_input: { command: 'git commit -m x' } },
            root,
            () => ({ status: 1, stdout: 'lint: 3 problems\n' }),
            () => root
        );
        expect(outcome.exit).toBe(2);
        expect(outcome.stderr).toContain('Commit blocked');
        expect(outcome.stderr).toContain('lint: 3 problems');
    });

    it('lets the commit through when the gate passes', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide(
            { tool_input: { command: 'git commit -m x' } },
            root,
            () => ({ status: 0 }),
            () => root
        );
        expect(outcome.exit).toBe(0);
    });

    it('names the reason when the gate could not run at all', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide(
            { tool_input: { command: 'git commit -m x' } },
            root,
            () => ({ status: null, error: new Error('spawn yarn ENOENT') }),
            () => root
        );
        expect(outcome.exit).toBe(2);
        expect(outcome.stderr).toContain('spawn yarn ENOENT');
    });
});

describe('verify-before-stop hook', () => {
    const prompt = text => ({ type: 'user', message: { content: text } });
    const toolResult = { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } };
    const use = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
    const edit = file => use('Edit', { file_path: path.join(ROOT, file) });

    it('sends the agent back when source changed this turn with no report', () => {
        const verdict = evaluate([prompt('do it'), edit('libs/data/src/x.ts'), toolResult], ROOT);
        expect(verdict.decision).toBe('block');
        expect(verdict.reason).toContain('libs/data/src/x.ts');
        expect(verdict.reason).toContain('dou-verify');
    });

    it('passes once a verification report was written or published', () => {
        const entries = [
            prompt('do it'),
            edit('apps/web/src/a.tsx'),
            use('Artifact', { file_path: '/s/verify-report-a.html' }),
        ];
        expect(evaluate(entries, ROOT)).toBeNull();
    });

    it('counts source written through the shell', () => {
        const entries = [prompt('go'), use('Bash', { command: "sed -i '' 's/a/b/' libs/sync/src/queue.ts" })];
        expect(evaluate(entries, ROOT).reason).toContain('libs/sync/src/queue.ts');
        expect(evaluate([prompt('go'), use('Bash', { command: 'cat libs/sync/src/queue.ts' })], ROOT)).toBeNull();
    });

    it('recognises an edit in a worktree below the project directory', () => {
        const file = path.join(ROOT, '.claude/worktrees/other/apps/web/src/a.ts');
        expect(evaluate([prompt('go'), use('Write', { file_path: file })], ROOT).decision).toBe('block');
    });

    it('ignores docs and edits from earlier turns', () => {
        expect(evaluate([prompt('a'), edit('apps/web/README.md')], ROOT)).toBeNull();
        expect(evaluate([prompt('a'), edit('libs/data/src/x.ts'), prompt('now explain')], ROOT)).toBeNull();
    });
});

describe('lint-edited-file hook', () => {
    it('lints only source files inside the project', () => {
        expect(lint({ tool_input: { file_path: path.join(ROOT, 'AGENTS.md') } }, ROOT)).toBeNull();
        expect(lint({ tool_input: { file_path: '/elsewhere/x.ts' } }, ROOT)).toBeNull();
    });

    it('runs eslint from the nearest directory with its own config', () => {
        expect(configDirFor(path.join(ROOT, 'apps/mobile/src/App.tsx'), ROOT)).toBe(path.join(ROOT, 'apps/mobile'));
        expect(configDirFor(path.join(ROOT, 'apps/web/src/main.tsx'), ROOT)).toBe(ROOT);
    });
});
