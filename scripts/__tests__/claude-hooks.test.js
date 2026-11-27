const fs = require('fs');
const os = require('os');
const path = require('path');

const { isCommit, commitDir, decide, reasonOf } = require('../../.claude/hooks/gate-before-commit.cjs');
const { evaluate } = require('../../.claude/hooks/verify-before-stop.cjs');
const { lint, configDirFor } = require('../../.claude/hooks/lint-edited-file.cjs');

const ROOT = path.resolve(__dirname, '../..');

process.env.DOU_HOOK_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
process.env.DOU_HOOK_MODES = path.join(process.env.DOU_HOOK_LOG_DIR, 'modes.json');
fs.writeFileSync(process.env.DOU_HOOK_MODES, '{}');
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
        `node -e 'console.log("cd /tmp && git commit -m x")'`,
        'cat <<\\EOF\nx; git commit -m z\nEOF',
        'python3 - <<EOF\nimport os\nos.system("x")\ncd y; git commit -m z\nEOF',
    ])('leaves %s alone', command => expect(isCommit(command)).toBe(false));

    it.each([
        "# don't\ngit commit -m y",
        "echo it\\'s; git commit -m x",
        'cat <<< "x"\ngit commit -m y',
        'echo $((1<<2))\ngit commit -m y',
        "echo 'unclosed\ngit commit -m y",
        'echo $((a<<b))\ngit commit -m y',
    ])('still sees the commit in %s', command => expect(isCommit(command)).toBe(true));

    it('cannot resolve a cd to a variable and ignores a closed subshell', () => {
        expect(commitDir('cd "$WT" && git commit -m x', ROOT)).toBeNull();
        expect(commitDir('git -C "$WT" commit -m x', ROOT)).toBeNull();
        expect(commitDir(`(cd ${os.tmpdir()} && ls); git commit -m x`, ROOT)).toBe(ROOT);
        expect(commitDir('cd apps && cd .. && git commit -m x', ROOT)).toBe(ROOT);
        expect(commitDir(`cd ${ROOT} && cd apps && git commit -m x`, os.tmpdir())).toBe(ROOT);
    });

    it('still sees a commit whose message is a quoted heredoc', () => {
        expect(isCommit(`git commit -m "$(cat <<'EOF'\nfix(x): say "hi"; git commit\nEOF\n)"`)).toBe(true);
        expect(isCommit('git add -A && git commit -F - <<EOF\nfix: y\nEOF')).toBe(true);
    });

    it('gates the tree a leading cd moves to', () => {
        expect(commitDir(`cd ${ROOT}/apps && git commit -m x`, os.tmpdir())).toBe(ROOT);
        expect(commitDir(`cd "${ROOT}" && git -C apps commit -m x`, os.tmpdir())).toBe(ROOT);
    });

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

    it('names the reason when the gate could not run at all, without blocking', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide({ session_id: session(), tool_input: { command: MSG } }, root, {
            mode: 'enforce',
            resolveDir: () => root,
            runGate: () => ({ status: null, error: new Error('spawn yarn ENOENT') }),
        });
        expect(outcome.exit).toBe(0);
        expect(outcome.stdout).toContain('spawn yarn ENOENT');
    });
});

describe('gate modes, trailer and escape hatch', () => {
    const run = (sessionId, command, mode, status = 1, trailerMode = mode) =>
        decide({ session_id: sessionId, tool_input: { command } }, ROOT, {
            mode,
            trailerMode,
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
            trailerMode: 'enforce',
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

    it('enforces the gate while the trailer check only observes', () => {
        const missing = run(session(), 'git commit -m "fix(web): x"', 'enforce', 0, 'observe');
        expect(missing.exit).toBe(0);
        expect(JSON.parse(missing.stdout).hookSpecificOutput.additionalContext).toContain('verified-by-trailer');
        const failing = run(session(), 'git commit -m "fix(web): x"', 'enforce', 1, 'observe');
        expect(failing.exit).toBe(2);
        expect(failing.stderr).toContain('typecheck failed');
        expect(failing.stderr).not.toContain('Verified-by');
    });

    it('logs the names of the failed gate steps', () => {
        const id = session();
        decide({ session_id: id, tool_input: { command: MSG } }, ROOT, {
            mode: 'observe',
            trailerMode: 'observe',
            resolveDir: () => repoWith({ gate: 'x' }),
            runGate: () => ({
                status: 1,
                stdout: '… lint\r✓ lint (2.0s)\n… unused code (knip)\r✗ unused code (knip) (3.1s)\n… test\r✗ test (9.0s)\n',
            }),
        });
        const line = fs
            .readFileSync(path.join(process.env.DOU_HOOK_LOG_DIR, 'gate-before-commit.jsonl'), 'utf8')
            .split('\n')
            .find(entry => entry.includes(id));
        expect(JSON.parse(line).detail.steps).toEqual(['unused code (knip)', 'test']);
    });

    const enforceWith = (runGate, command = MSG, root = repoWith({ gate: 'x' })) =>
        decide({ session_id: session(), tool_input: { command } }, root, {
            mode: 'enforce',
            trailerMode: 'observe',
            resolveDir: () => root,
            runGate,
        });

    it.each([
        ['a spawn error', { status: null, error: new Error('spawnSync yarn ETIMEDOUT') }, 'ETIMEDOUT'],
        ['a signal', { status: null, signal: 'SIGKILL' }, 'SIGKILL'],
        ['a usage error', { status: 2, stdout: 'cannot resolve a merge base with origin/develop' }, 'merge base'],
    ])('notes instead of blocking when the gate could not run: %s', (_, result, text) => {
        const outcome = enforceWith(() => result);
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).hookSpecificOutput.additionalContext).toContain(text);
    });

    it('notes instead of blocking when the install does not match yarn.lock', () => {
        const root = repoWith({ gate: 'x' });
        const outcome = decide({ session_id: session(), tool_input: { command: MSG } }, root, {
            mode: 'enforce',
            trailerMode: 'observe',
            resolveDir: () => root,
            runGate: () => ({ status: 1, stdout: 'TS2305' }),
            isInstallCurrent: () => false,
        });
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).hookSpecificOutput.additionalContext).toContain('yarn install');
    });

    it('notes instead of blocking when typecheck fails on stale build output', () => {
        const outcome = enforceWith(() => ({
            status: 1,
            stdout: "x.ts(1,1): error TS6305: Output file 'dist/out-tsc/a.d.ts' has not been built from source file 'a.ts'.\n",
        }));
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).hookSpecificOutput.additionalContext).toContain('rm -rf dist/out-tsc');
    });

    it('blocks on exit 2 that is not a missing merge base', () => {
        expect(enforceWith(() => ({ status: 2, stdout: 'no `-t typecheck --exclude=` found' })).exit).toBe(2);
    });

    it('notes, without running the gate, when the commit directory cannot be resolved', () => {
        const outcome = decide({ session_id: session(), tool_input: { command: MSG } }, ROOT, {
            mode: 'enforce',
            trailerMode: 'observe',
            resolveDir: () => null,
            runGate: () => {
                throw new Error('must not run');
            },
        });
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).hookSpecificOutput.additionalContext).toContain('was not run');
    });

    it('passes on what the gate says it lowered and staged', () => {
        const outcome = enforceWith(() => ({
            status: 0,
            stdout: 'gate: lowered scripts/ratchet/source-ratchet-baseline.json and staged it — commit it with the change\n',
        }));
        expect(outcome.exit).toBe(0);
        expect(JSON.parse(outcome.stdout).hookSpecificOutput.additionalContext).toContain(
            'source-ratchet-baseline.json'
        );
    });

    it('lets a wip commit through a failing gate', () => {
        expect(enforceWith(() => ({ status: 1 }), 'git commit -q --no-verify -m "wip: m3.2"').exit).toBe(0);
        expect(enforceWith(() => ({ status: 1 }), 'git commit -m "fix: wipe the cache"').exit).toBe(2);
        expect(enforceWith(() => ({ status: 1 }), 'git stash push -m "wip"; git commit -m "feat: x"').exit).toBe(2);
        expect(enforceWith(() => ({ status: 1 }), 'grep -m 1 x f && git commit -m "wip: y"').exit).toBe(0);
    });

    it('does not rerun the gate for an override after two blocks', () => {
        const id = session();
        let runs = 0;
        const go = command =>
            decide({ session_id: id, tool_input: { command } }, ROOT, {
                mode: 'enforce',
                trailerMode: 'observe',
                resolveDir: () => repoWith({ gate: 'x' }),
                runGate: () => {
                    runs += 1;
                    return { status: 1 };
                },
            });
        go(MSG);
        go(MSG);
        expect(go(`DOU_HOOK_REASON="flake noted in the PR" ${MSG}`).exit).toBe(0);
        expect(runs).toBe(2);
    });

    it('ships with the gate enforced and the trailer observed', () => {
        const modes = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/hooks/modes.json'), 'utf8'));
        expect(Object.keys(modes)).toContain('verified-by-trailer');
        expect(lib.modeOf('gate-before-commit', modes)).toBe('enforce');
        expect(lib.modeOf('verified-by-trailer', modes)).toBe('observe');
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

describe('hook commands in settings.json', () => {
    const { spawnSync } = require('child_process');
    const { hooksConfig, install } = require('../install-claude-hooks.js');
    const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
    const commandsFor = name =>
        Object.values(settings.hooks)
            .flat()
            .flatMap(group => group.hooks.map(hook => hook.command))
            .filter(command => command.endsWith(` ${name}`));

    const runCommand = (command, input, env = {}) => {
        const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'config-root-'));
        return spawnSync('sh', ['-c', command], {
            cwd: elsewhere,
            input: JSON.stringify(input),
            encoding: 'utf8',
            env: { ...process.env, CLAUDE_PROJECT_DIR: elsewhere, ...env },
        });
    };

    it('is generated from install-claude-hooks.js', () => {
        expect(settings.hooks).toEqual(hooksConfig());
    });

    it("runs the session checkout's hook when the project directory is another checkout", () => {
        const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
        const id = session();
        const input = {
            cwd: path.join(ROOT, 'apps'),
            session_id: id,
            hook_event_name: 'PostToolUseFailure',
            tool_input: { command: 'yarn gate' },
        };
        const [command] = commandsFor('check-escalation');
        const result = runCommand(command, input, { DOU_HOOK_LOG_DIR: logDir });
        expect(result.status).toBe(0);
        expect(JSON.parse(fs.readFileSync(path.join(logDir, `state-${id}.json`), 'utf8')).failures).toEqual({
            'yarn gate': 1,
        });
    });

    it('passes a blocking exit code and stderr through', () => {
        const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
        const modes = path.join(logDir, 'modes.json');
        fs.writeFileSync(modes, JSON.stringify({ 'check-escalation': 'enforce' }));
        const input = { cwd: ROOT, session_id: session(), hook_event_name: 'PostToolUseFailure' };
        const [command] = commandsFor('check-escalation');
        let result;
        for (let i = 0; i < 3; i += 1) {
            result = runCommand(
                command,
                { ...input, tool_input: { command: 'yarn gate' } },
                { DOU_HOOK_LOG_DIR: logDir, DOU_HOOK_MODES: modes }
            );
        }
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('Hand it to the user');
    });

    it('does nothing outside a checkout that has the hook', () => {
        const [command] = commandsFor('verify-before-stop');
        const result = runCommand(command, { cwd: os.tmpdir(), session_id: session() });
        expect(result.status).toBe(0);
        expect(result.stdout + result.stderr).toBe('');
    });

    it('installs into a local settings file, keeping what is there, once', () => {
        const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'local-settings-')), 'settings.local.json');
        fs.writeFileSync(target, JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }));
        expect(install(target)).toBe('installed');
        expect(install(target)).toBe('unchanged');
        const written = JSON.parse(fs.readFileSync(target, 'utf8'));
        expect(written.permissions).toEqual({ allow: ['Bash(ls)'] });
        expect(written.hooks).toEqual(settings.hooks);
    });
});
