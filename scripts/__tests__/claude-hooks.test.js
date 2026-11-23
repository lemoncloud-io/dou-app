const fs = require('fs');
const os = require('os');
const path = require('path');

const { isCommit, commitDir, decide, reasonOf } = require('../../.claude/hooks/gate-before-commit.cjs');
const { evaluate } = require('../../.claude/hooks/verify-before-stop.cjs');
const { lint, configDirFor } = require('../../.claude/hooks/lint-edited-file.cjs');

const ROOT = path.resolve(__dirname, '../..');

process.env.DOU_HOOK_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
const lib = require('../../.claude/hooks/lib.cjs');
const { checkKey, handle } = require('../../.claude/hooks/check-escalation.cjs');

const MSG = 'git commit -m "x\n\nVerified-by: gate"';
let sessionNo = 0;
const session = () => `s${(sessionNo += 1)}`;

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
        const outcome = decide({ session_id: session(), tool_input: { command: MSG } }, root, {
            mode: 'enforce',
            resolveDir: () => root,
            runGate: () => {
                throw new Error('must not run');
            },
        });
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).hookSpecificOutput.additionalContext).toContain('yarn gate is not defined');
    });

    it('blocks the commit when the gate fails, with the tail of its output', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide({ session_id: session(), tool_input: { command: MSG } }, root, {
            mode: 'enforce',
            resolveDir: () => root,
            runGate: () => ({ status: 1, stdout: 'lint: 3 problems\n' }),
        });
        expect(outcome.exit).toBe(2);
        expect(outcome.stderr).toContain('Commit blocked');
        expect(outcome.stderr).toContain('lint: 3 problems');
    });

    it('lets the commit through when the gate passes', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide({ session_id: session(), tool_input: { command: MSG } }, root, {
            mode: 'enforce',
            resolveDir: () => root,
            runGate: () => ({ status: 0 }),
        });
        expect(outcome.exit).toBe(0);
    });

    it('names the reason when the gate could not run at all', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide({ session_id: session(), tool_input: { command: MSG } }, root, {
            mode: 'enforce',
            resolveDir: () => root,
            runGate: () => ({ status: null, error: new Error('spawn yarn ENOENT') }),
        });
        expect(outcome.exit).toBe(2);
        expect(outcome.stderr).toContain('spawn yarn ENOENT');
    });
});

describe('gate modes, trailer and escape hatch', () => {
    const run = (sessionId, command, mode, status = 1) =>
        decide({ session_id: sessionId, tool_input: { command } }, ROOT, {
            mode,
            resolveDir: () => repoWith({ gate: 'x' }),
            runGate: () => ({ status, stdout: 'typecheck failed\n' }),
        });

    it('blocks a commit with no Verified-by trailer', () => {
        const outcome = run(session(), 'git commit -m "fix(web): x"', 'enforce', 0);
        expect(outcome.exit).toBe(2);
        expect(outcome.stderr).toContain('Verified-by');
    });

    it('reads the trailer from a message file', () => {
        const root = repoWith({});
        fs.writeFileSync(path.join(root, 'msg.txt'), 'fix(web): x\n\nVerified-by: gate, web-e2e\n');
        const outcome = decide({ session_id: session(), tool_input: { command: 'git commit -F msg.txt' } }, root, {
            mode: 'enforce',
            resolveDir: () => root,
            runGate: () => ({ status: 0 }),
        });
        expect(outcome.exit).toBe(0);
    });

    it('only logs in observe mode', () => {
        const id = session();
        const outcome = run(id, MSG, 'observe');
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).hookSpecificOutput.additionalContext).toContain('would have been blocked');
        const log = fs.readFileSync(path.join(process.env.DOU_HOOK_LOG_DIR, 'gate-before-commit.jsonl'), 'utf8');
        expect(log).toContain(id);
        expect(log).toContain('would-block');
    });

    it('opens the escape hatch after two blocks in a row and logs the reason', () => {
        const id = session();
        expect(run(id, MSG, 'enforce').exit).toBe(2);
        const second = run(id, MSG, 'enforce');
        expect(second.exit).toBe(2);
        expect(second.stderr).toContain('DOU_HOOK_REASON');
        expect(run(id, MSG, 'enforce').exit).toBe(2);
        const third = run(id, `DOU_HOOK_REASON="typecheck flake tracked in the PR" ${MSG}`, 'enforce');
        expect(third.exit).toBe(0);
        const log = fs.readFileSync(path.join(process.env.DOU_HOOK_LOG_DIR, 'gate-before-commit.jsonl'), 'utf8');
        expect(log).toContain('typecheck flake tracked in the PR');
    });

    it('accepts the trailer from a second -m and exempts commits that reuse a message', () => {
        expect(run(session(), 'git commit -m "fix(web): x" -m "Verified-by: gate"', 'enforce', 0).exit).toBe(0);
        expect(run(session(), 'git commit --amend --no-edit', 'enforce', 0).exit).toBe(0);
        expect(run(session(), 'git commit --fixup abc123', 'enforce', 0).exit).toBe(0);
        expect(run(session(), 'git commit -m "x\\nVerified-by:"', 'enforce', 0).exit).toBe(2);
    });

    it('takes the reason only from the env prefix of the commit itself', () => {
        expect(reasonOf('DOU_HOOK_REASON="flaky upstream" git commit -m x')).toBe('flaky upstream');
        expect(reasonOf('DOU_HOOK_REASON=quick git commit -m x')).toBe('quick');
        expect(reasonOf('echo DOU_HOOK_REASON="x"; git commit -m y')).toBeUndefined();
        expect(reasonOf('git commit -m "DOU_HOOK_REASON=\'x\'"')).toBeUndefined();
    });

    it('does not accept a reason before the gate has blocked twice', () => {
        expect(run(session(), `DOU_HOOK_REASON="skip" ${MSG}`, 'enforce').exit).toBe(2);
    });

    it('reads the mode from modes.json and defaults to observe', () => {
        expect(lib.modeOf('gate-before-commit', { 'gate-before-commit': 'enforce' })).toBe('enforce');
        expect(lib.modeOf('unknown-hook', {})).toBe('observe');
        expect(lib.modeOf('x', { x: 'loud' })).toBe('observe');
    });
});

describe('check-escalation hook', () => {
    const failure = (id, command) =>
        handle(
            {
                session_id: id,
                hook_event_name: 'PostToolUseFailure',
                tool_input: { command },
                error: 'Exit code 1\nboom',
            },
            'enforce'
        );

    it('keys checks by command, not by unrelated shell around them', () => {
        expect(checkKey('cd apps && npx nx test web --skip-nx-cache')).toBe('nx test web --skip-nx-cache');
        expect(checkKey('yarn gate')).toBe('yarn gate');
        expect(checkKey('git status')).toBeUndefined();
        expect(checkKey('grep -r "yarn test" .')).toBeUndefined();
        expect(checkKey('git log --grep jest')).toBeUndefined();
        expect(checkKey('yarn lint:fix')).toBeUndefined();
        expect(checkKey('yarn web:test')).toBe('yarn web:test');
    });

    it('hands the failure to the user on the third failure in a row, then blocks the check', () => {
        const id = session();
        expect(failure(id, 'yarn gate').exit).toBe(0);
        expect(failure(id, 'yarn gate').exit).toBe(0);
        const third = failure(id, 'yarn gate');
        expect(third.exit).toBe(2);
        expect(third.stderr).toContain('Hand it to the user');
        const again = handle(
            { session_id: id, hook_event_name: 'PreToolUse', tool_input: { command: 'yarn gate' } },
            'enforce'
        );
        expect(again.exit).toBe(2);
        handle({ session_id: id, hook_event_name: 'UserPromptSubmit' }, 'enforce');
        expect(
            handle({ session_id: id, hook_event_name: 'PreToolUse', tool_input: { command: 'yarn gate' } }, 'enforce')
                .exit
        ).toBe(0);
    });

    it('resets the count when the check passes', () => {
        const id = session();
        failure(id, 'yarn gate');
        failure(id, 'yarn gate');
        handle({ session_id: id, hook_event_name: 'PostToolUse', tool_input: { command: 'yarn gate' } }, 'enforce');
        expect(failure(id, 'yarn gate').exit).toBe(0);
    });

    it('only logs in observe mode', () => {
        const id = session();
        for (let i = 0; i < 3; i += 1) {
            expect(
                handle(
                    { session_id: id, hook_event_name: 'PostToolUseFailure', tool_input: { command: 'yarn gate' } },
                    'observe'
                ).exit
            ).toBe(0);
        }
        const log = fs.readFileSync(path.join(process.env.DOU_HOOK_LOG_DIR, 'check-escalation.jsonl'), 'utf8');
        expect(log).toContain('would-escalate');
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
