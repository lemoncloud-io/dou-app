#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const COMMIT =
    /(?:^|&&|\|\||[;|(\n])\s*(?:\S*\/)?git((?:\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)|-c\s+\S+|--[\w-]+(?:=\S+)?))*)\s+commit(?=\s|$)/;

const commitMatch = command => (typeof command === 'string' ? command.match(COMMIT) : null);

const isCommit = command => Boolean(commitMatch(command));

const commitDir = (command, base) => {
    const option = commitMatch(command)?.[1].match(/-C\s+("[^"]*"|'[^']*'|\S+)/);
    const target = option ? path.resolve(base, option[1].replace(/^["']|["']$/g, '')) : base;
    const top = spawnSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    return top.status === 0 ? top.stdout.trim() : target;
};

const hasGate = root => {
    try {
        return Boolean(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.gate);
    } catch {
        return false;
    }
};

const decide = (input, base, runGate, resolveDir = commitDir) => {
    const command = input?.tool_input?.command;
    if (!isCommit(command)) return { exit: 0 };
    const root = resolveDir(command, input?.cwd || base);
    if (!hasGate(root)) {
        const note = 'yarn gate is not defined in package.json yet, so the pre-commit gate hook skipped. Run lint, typecheck and test for the affected projects by hand (dou-ship).';
        return {
            exit: 0,
            stdout: JSON.stringify({
                systemMessage: note,
                hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: note },
            }),
        };
    }
    const result = runGate(root);
    if (result.status === 0) return { exit: 0 };
    const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-60).join('\n');
    const why = result.error ? `could not run: ${result.error.message}` : `exit ${result.status}`;
    return { exit: 2, stderr: `Commit blocked: yarn gate failed in ${root} (${why}). Fix it, then commit.\n${tail}` };
};

const runYarnGate = root =>
    spawnSync('yarn', ['gate'], { cwd: root, encoding: 'utf8', timeout: 25 * 60_000, maxBuffer: 64 * 1024 * 1024 });

if (require.main === module) {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const outcome = decide(JSON.parse(fs.readFileSync(0, 'utf8') || '{}'), root, runYarnGate);
    if (outcome.stdout) process.stdout.write(`${outcome.stdout}\n`);
    if (outcome.stderr) process.stderr.write(`${outcome.stderr}\n`);
    process.exit(outcome.exit);
}

module.exports = { isCommit, commitDir, hasGate, decide };
