#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { readInput, modeOf, decideBlock, record, loadState, BLOCKS_BEFORE_ESCAPE } = require('./lib.cjs');

const COMMIT =
    /(?:^|&&|\|\||[;|(\n])\s*((?:\w+=(?:"[^"]*"|'[^']*'|\S+)\s+)*)(?:\S*\/)?git((?:\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)|-c\s+\S+|--[\w-]+(?:=\S+)?))*)\s+commit(?=\s|$)/;

const HEREDOC = /^<<-?\s*\\?(['"]?)([A-Za-z_][\w.-]*)\1/;

const scanShell = command => {
    const out = [...command];
    const blank = (from, to) => {
        for (let i = from; i < to; i++) out[i] = 'x';
    };
    const heredocAt = at => {
        if (command[at - 1] === '<' || command[at + 2] === '<') return null;
        const before = command.slice(0, at);
        if (before.lastIndexOf('$((') > before.lastIndexOf('))')) return null;
        const head = command.slice(at).match(HEREDOC);
        if (!head) return null;
        const bodyStart = command.indexOf('\n', at);
        if (bodyStart < 0) return null;
        const end = new RegExp(`\n\\s*${head[2].replace(/[.-]/g, '\\$&')}(?=\n|$)`).exec(command.slice(bodyStart));
        const bodyEnd = end ? bodyStart + end.index + end[0].length : command.length;
        return { skipTo: at + head[0].length, bodyStart, bodyEnd };
    };
    let quote = null;
    const pending = [];
    for (let i = 0; i < command.length; i++) {
        const heredoc = pending.find(h => h.bodyStart === i);
        if (heredoc) {
            blank(heredoc.bodyStart, heredoc.bodyEnd);
            i = heredoc.bodyEnd - 1;
            continue;
        }
        const c = command[i];
        if (quote === "'") {
            if (c === "'") quote = null;
            else out[i] = 'x';
        } else if (quote === '"') {
            if (c === '\\') {
                out[i] = 'x';
                if (i + 1 < command.length) out[++i] = 'x';
            } else if (c === '"') quote = null;
            else {
                if (command.startsWith('<<', i)) {
                    const found = heredocAt(i);
                    if (found) pending.push(found);
                }
                out[i] = 'x';
            }
        } else if (c === '\\') {
            out[i] = 'x';
            if (i + 1 < command.length && command[i + 1] !== '\n') out[++i] = 'x';
        } else if (c === '#' && (i === 0 || /[\s;&|(]/.test(command[i - 1]))) {
            while (i < command.length && command[i] !== '\n') out[i++] = 'x';
            i--;
        } else if (c === "'" || c === '"') quote = c;
        else if (command.startsWith('<<', i)) {
            const found = heredocAt(i);
            if (found) {
                pending.push(found);
                i = found.skipTo - 1;
            }
        }
    }
    return { masked: out.join(''), open: quote !== null };
};

const maskQuoted = command => scanShell(command).masked;

const locateCommit = command => {
    if (typeof command !== 'string') return null;
    const { masked, open } = scanShell(command);
    const hit = masked.match(COMMIT) || (open ? command.match(COMMIT) : null);
    return hit ? { index: hit.index, length: hit[0].length, masked } : null;
};

const commitMatch = command => {
    const hit = locateCommit(command);
    return hit ? command.slice(hit.index, hit.index + hit.length).match(COMMIT) : null;
};

const isCommit = command => Boolean(commitMatch(command));

const commitSegment = command => {
    const hit = locateCommit(command);
    if (!hit) return '';
    const after = hit.masked.slice(hit.index + hit.length).search(/&&|\|\||[;|\n]/);
    return command.slice(hit.index, after < 0 ? command.length : hit.index + hit.length + after);
};

const withoutClosedSubshells = text => {
    let previous;
    let current = text;
    do {
        previous = current;
        current = current.replace(/\([^()]*\)/g, group => 'x'.repeat(group.length));
    } while (current !== previous);
    return current;
};

const cdsBefore = command => {
    const hit = locateCommit(command);
    const prefix = withoutClosedSubshells((hit?.masked ?? maskQuoted(command)).slice(0, hit?.index ?? 0));
    return [...prefix.matchAll(/(?:^|&&|[;\n(])\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|)]+)/g)].map(cd => {
        const start = cd.index + cd[0].length - cd[1].length;
        return command.slice(start, start + cd[1].length).replace(/^["']|["']$/g, '');
    });
};

const DYNAMIC = /[$`]/;

const commitDir = (command, base) => {
    const cds = cdsBefore(command);
    const option = commitMatch(command)?.[2].match(/-C\s+("[^"]*"|'[^']*'|\S+)/)?.[1];
    if (cds.some(cd => DYNAMIC.test(cd)) || (option && DYNAMIC.test(option))) return null;
    const from = cds.reduce((dir, cd) => path.resolve(dir, cd.replace(/^~(?=\/|$)/, process.env.HOME || '~')), base);
    const target = option ? path.resolve(from, option.replace(/^["']|["']$/g, '')) : from;
    const top = spawnSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    return top.status === 0 ? top.stdout.trim() : null;
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

const failedSteps = output =>
    output
        .split(/\r?\n|\r/)
        .filter(line => line.startsWith('✗ '))
        .map(line => line.slice(2).replace(/\s*\(\d+(?:\.\d+)?s\)$/, '').trim());

const yarnEnv = () => ({ ...process.env, NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || 'unused' });

const installCurrent = root =>
    !fs.existsSync(path.join(root, 'yarn.lock')) ||
    spawnSync('yarn', ['check', '--integrity'], { cwd: root, env: yarnEnv(), encoding: 'utf8', timeout: 120_000 })
        .status === 0;

const gateProblems = (root, runGate, isInstallCurrent = installCurrent) => {
    if (!hasGate(root)) {
        return {
            problems: [],
            notes: ['yarn gate is not defined in package.json yet; run lint, typecheck and test for the affected projects by hand (dou-ship).'],
        };
    }
    const result = runGate(root);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const said = output.split(/\r?\n|\r/).filter(line => line.startsWith('gate: lowered'));
    if (result.status === 0) return { problems: [], notes: said };
    const tail = output.split(/\r?\n|\r/).slice(-60).join('\n');
    const steps = failedSteps(output);
    if (result.error || result.signal || (result.status === 2 && /cannot resolve a merge base/.test(output))) {
        const why = result.error ? result.error.message : result.signal ? `killed by ${result.signal}` : `exit 2: ${tail.split('\n').pop()}`;
        return { problems: [], notes: [`yarn gate could not run in ${root} (${why}); run it by hand before pushing.`], unrun: why, steps };
    }
    if (/error TS6305/.test(output)) {
        return {
            problems: [],
            notes: [
                `yarn gate failed in ${root} on stale build output (TS6305: an output file was not built from its source); run \`rm -rf dist/out-tsc\` and \`yarn gate\` before pushing.\n${tail}`,
            ],
            unrun: 'stale dist/out-tsc (TS6305)',
            steps,
        };
    }
    if (!isInstallCurrent(root)) {
        return {
            problems: [],
            notes: [`yarn gate failed in ${root}, but \`yarn check --integrity\` says node_modules does not match yarn.lock, so the failure may be the install; run \`yarn install\` and \`yarn gate\` before pushing.\n${tail}`],
            unrun: 'node_modules does not match yarn.lock',
            steps,
        };
    }
    return { problems: [`yarn gate failed in ${root} (exit ${result.status}):\n${tail}`], notes: [], steps };
};

const WIP = /^\s*wip\b/i;

const decide = (input, base, deps) => {
    const {
        runGate,
        resolveDir = commitDir,
        mode = modeOf('gate-before-commit'),
        trailerMode = modeOf('verified-by-trailer'),
        block = decideBlock,
        log = record,
        blocksSoFar = name => loadState(input?.session_id).blocks[name] ?? 0,
        isInstallCurrent = installCurrent,
    } = deps;
    const command = input?.tool_input?.command;
    if (!isCommit(command) || (mode === 'off' && trailerMode === 'off')) return { exit: 0 };
    const resolved = resolveDir(command, input?.cwd || base);
    const root = resolved ?? input?.cwd ?? base;
    const reason = reasonOf(command);
    const session = input?.session_id;
    const detail = { command: command.slice(0, 300) };
    const notes = [];
    const blocked = [];

    const judge = (name, checkMode, problems, extra = {}) => {
        if (checkMode === 'off') return;
        const verdict = block({
            name,
            session,
            mode: checkMode,
            block: problems.length > 0,
            reason,
            detail: { ...detail, problems: problems.map(p => p.split('\n')[0]), ...extra },
        });
        if (verdict.observed) notes.push(`Observe mode (${name}): this commit would have been blocked: ${problems.map(p => p.split('\n')[0]).join(' ')}`);
        if (verdict.overridden) notes.push(`${name} overridden with the reason given; logged.`);
        if (verdict.blocked) blocked.push({ problems, escapeOpen: verdict.escapeOpen });
    };

    const trailerMissing =
        needsTrailer(command) && !TRAILER.test(messageArgs(command)) && !TRAILER.test(commitMessage(command, root));
    judge('verified-by-trailer', trailerMode, trailerMissing ? ['The commit message has no `Verified-by:` trailer (dou-ship: e.g. `Verified-by: gate, web-e2e` or `none`).'] : []);

    const wip = WIP.test(messageArgs(commitSegment(command)).split('\n')[0] || '');
    if (mode !== 'off' && !resolved) {
        log('gate-before-commit', { session, outcome: 'could-not-run', detail: { ...detail, why: 'commit directory not resolved' } });
        notes.push('Could not tell which checkout this commit runs in (a `cd` or `-C` to a variable, or not a git checkout); yarn gate was not run. Run it by hand before pushing.');
    } else if (mode !== 'off' && reason && blocksSoFar('gate-before-commit') >= BLOCKS_BEFORE_ESCAPE) {
        judge('gate-before-commit', mode, ['yarn gate not rerun: override requested after two blocks']);
    } else if (mode !== 'off') {
        const gate = gateProblems(root, runGate, isInstallCurrent);
        notes.push(...gate.notes);
        const extra = gate.steps ? { steps: gate.steps } : {};
        if (gate.unrun) log('gate-before-commit', { session, outcome: 'could-not-run', detail: { ...detail, why: gate.unrun, ...extra } });
        if (wip && gate.problems.length) {
            log('gate-before-commit', { session, outcome: 'wip-passed', detail: { ...detail, ...extra } });
            notes.push('A wip commit is let through with a failing gate; the gate runs again on the commit that replaces it.');
        } else if (!gate.unrun) judge('gate-before-commit', mode, gate.problems, extra);
    }

    if (blocked.length) {
        const escape = blocked.every(b => b.escapeOpen)
            ? '\nThis gate has now blocked twice in a row. If you are sure, retry with DOU_HOOK_REASON="<why>" in front of the command; the reason is logged for review.'
            : '';
        return { exit: 2, stderr: `Commit blocked.\n${blocked.flatMap(b => b.problems).join('\n')}${escape}` };
    }
    return notes.length ? { exit: 0, stdout: notice(notes.join(' ')) } : { exit: 0 };
};

const runYarnGate = root =>
    spawnSync('yarn', ['gate'], { cwd: root, env: yarnEnv(), encoding: 'utf8', timeout: 25 * 60_000, maxBuffer: 64 * 1024 * 1024 });

if (require.main === module) {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const outcome = decide(readInput(), root, { runGate: runYarnGate });
    if (outcome.stdout) process.stdout.write(`${outcome.stdout}\n`);
    if (outcome.stderr) process.stderr.write(`${outcome.stderr}\n`);
    process.exit(outcome.exit);
}

module.exports = {
    isCommit,
    commitDir,
    hasGate,
    commitMessage,
    messageArgs,
    needsTrailer,
    reasonOf,
    failedSteps,
    maskQuoted,
    installCurrent,
    commitSegment,
    decide,
};
