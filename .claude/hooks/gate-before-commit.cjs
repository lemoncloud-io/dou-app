#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { readInput, modeOf, decideBlock } = require('./lib.cjs');

const COMMIT =
    /(?:^|&&|\|\||[;|(\n])\s*((?:\w+=(?:"[^"]*"|'[^']*'|\S+)\s+)*)(?:\S*\/)?git((?:\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)|-c\s+\S+|--[\w-]+(?:=\S+)?))*)\s+commit(?=\s|$)/;

const commitMatch = command => (typeof command === 'string' ? command.match(COMMIT) : null);

const isCommit = command => Boolean(commitMatch(command));

const commitDir = (command, base) => {
    const option = commitMatch(command)?.[2].match(/-C\s+("[^"]*"|'[^']*'|\S+)/);
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

const REASON = /(?:^|\s)DOU_HOOK_REASON=("[^"]+"|'[^']+'|\S+)/;
const TRAILER = /^Verified-by: *[^\s"'].*$/m;
const REUSES_MESSAGE = /\s(?:--no-edit|--fixup[= ]\S+|--squash[= ]\S+|-[cC]\s+\S+|--reuse-message[= ]\S+|--reedit-message[= ]\S+)/;

const reasonOf = command => {
    const value = commitMatch(command)?.[1].match(REASON)?.[1];
    return value?.replace(/^["']|["']$/g, '');
};

const messageArgs = command =>
    [...command.matchAll(/(?:^|\s)(?:-m|--message)(?:\s+|=)("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/g)]
        .map(match => match[1].replace(/^["']|["']$/g, '').replace(/\\n/g, '\n'))
        .join('\n\n');

const needsTrailer = command => !REUSES_MESSAGE.test(command) && !(/\s--amend\b/.test(command) && !/\s(-m|--message|-F|--file)\b/.test(command));

const commitMessage = (command, root) => {
    const file = command.match(/(?:-F|--file)[ =]("[^"]+"|'[^']+'|[^\s;&|]+)/)?.[1]?.replace(/^["']|["']$/g, '');
    if (file && file !== '-') {
        try {
            return fs.readFileSync(path.resolve(root, file), 'utf8');
        } catch {
            return messageArgs(command);
        }
    }
    return `${messageArgs(command)}\n${command}`;
};

const notice = text => JSON.stringify({ systemMessage: text, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });

const decide = (input, base, deps) => {
    const { runGate, resolveDir = commitDir, mode = modeOf('gate-before-commit'), block = decideBlock } = deps;
    const command = input?.tool_input?.command;
    if (!isCommit(command) || mode === 'off') return { exit: 0 };
    const root = resolveDir(command, input?.cwd || base);
    const problems = [];
    const notes = [];
    if (needsTrailer(command) && !TRAILER.test(messageArgs(command)) && !TRAILER.test(commitMessage(command, root))) {
        problems.push('The commit message has no `Verified-by:` trailer (dou-ship: e.g. `Verified-by: gate, web-e2e` or `none`).');
    }
    if (hasGate(root)) {
        const result = runGate(root);
        if (result.status !== 0) {
            const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-60).join('\n');
            const why = result.error ? `could not run: ${result.error.message}` : `exit ${result.status}`;
            problems.push(`yarn gate failed in ${root} (${why}):\n${tail}`);
        }
    } else {
        notes.push('yarn gate is not defined in package.json yet; run lint, typecheck and test for the affected projects by hand (dou-ship).');
    }
    const reason = reasonOf(command);
    const verdict = block({
        name: 'gate-before-commit',
        session: input?.session_id,
        mode,
        block: problems.length > 0,
        reason,
        detail: { command: command.slice(0, 300), problems: problems.map(p => p.split('\n')[0]) },
    });
    if (verdict.observed) notes.push(`Observe mode: this commit would have been blocked: ${problems.map(p => p.split('\n')[0]).join(' ')}`);
    if (verdict.overridden) notes.push(`Gate overridden with the reason given; logged.`);
    if (verdict.blocked) {
        const escape = verdict.escapeOpen
            ? '\nThis gate has now blocked twice in a row. If you are sure, retry with DOU_HOOK_REASON="<why>" in front of the command; the reason is logged for review.'
            : '';
        return { exit: 2, stderr: `Commit blocked.\n${problems.join('\n')}${escape}` };
    }
    return notes.length ? { exit: 0, stdout: notice(notes.join(' ')) } : { exit: 0 };
};

const runYarnGate = root =>
    spawnSync('yarn', ['gate'], { cwd: root, encoding: 'utf8', timeout: 25 * 60_000, maxBuffer: 64 * 1024 * 1024 });

if (require.main === module) {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const outcome = decide(readInput(), root, { runGate: runYarnGate });
    if (outcome.stdout) process.stdout.write(`${outcome.stdout}\n`);
    if (outcome.stderr) process.stderr.write(`${outcome.stderr}\n`);
    process.exit(outcome.exit);
}

module.exports = { isCommit, commitDir, hasGate, commitMessage, messageArgs, needsTrailer, reasonOf, decide };
