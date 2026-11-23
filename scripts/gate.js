#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERIFY_WORKFLOW = path.join(ROOT, '.github/workflows/verify.yml');
const DEFAULT_BASE = 'origin/develop';

const USAGE = `Usage:
  yarn gate [--base <ref>] [--all] [--only checks,ratchets,lint,typecheck,test]
  node scripts/gate.js scope --base <sha>     # prints the nx scope CI uses`;

const STEP_GROUPS = ['checks', 'ratchets', 'lint', 'typecheck', 'test'];

const parseArgs = argv => {
    const options = { command: 'run', base: null, all: false, only: STEP_GROUPS };
    const rest = [...argv];
    if (rest[0] === 'scope') {
        options.command = 'scope';
        rest.shift();
    }
    const value = i => {
        if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(`${rest[i]} needs a value\n${USAGE}`);
        return rest[i + 1];
    };
    for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--base') options.base = value(i++);
        else if (rest[i] === '--all') options.all = true;
        else if (rest[i] === '--only') options.only = value(i++).split(',').filter(Boolean);
        else throw new Error(`unknown argument ${rest[i]}\n${USAGE}`);
    }
    for (const group of options.only)
        if (!STEP_GROUPS.includes(group)) throw new Error(`unknown step ${group}\n${USAGE}`);
    return options;
};

const OUTSIDE_PROJECTS = /^(?!(apps|libs)\/)(?!.*\.md$)/;

const decideScope = ({ base, changed, head }) => {
    if (!base) return ['run-many'];
    if (changed.some(file => OUTSIDE_PROJECTS.test(file))) return ['run-many'];
    return ['affected', `--base=${base}`, ...(head ? [`--head=${head}`] : [])];
};

const typecheckExclusions = (workflow = fs.readFileSync(VERIFY_WORKFLOW, 'utf8')) => {
    const match = workflow.match(/-t typecheck\s+--exclude=(\S+)/);
    if (!match) throw new Error('scripts/gate.js: no `-t typecheck --exclude=` found in .github/workflows/verify.yml');
    return match[1];
};

const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const changedSince = (base, { worktree }) => {
    const range = worktree ? [base] : [`${base}...HEAD`];
    const tracked = git(['diff', '--name-only', '--no-renames', ...range])
        .split('\n')
        .filter(Boolean);
    const untracked = worktree ? git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean) : [];
    return [...new Set([...tracked, ...untracked])];
};

const resolveBase = ref => {
    try {
        return git(['merge-base', ref, 'HEAD']).trim();
    } catch {
        throw new Error(`cannot resolve a merge base with ${ref}; run \`git fetch origin develop\` or pass --base`);
    }
};

const childEnv = () => ({
    ...process.env,
    NX_DAEMON: 'false',
    NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || 'unused',
    FORCE_COLOR: process.env.FORCE_COLOR || '0',
});

const buildSteps = ({ scope, base, only }) => {
    const nx = ['npx', 'nx', ...scope, '--skip-sync'];
    const steps = [
        { group: 'checks', name: 'doc links', cmd: ['node', 'scripts/check-doc-links.js'] },
        { group: 'checks', name: 'doc language', cmd: ['node', 'scripts/check-doc-korean.js'] },
        { group: 'checks', name: 'code comment language', cmd: ['node', 'scripts/check-code-korean.js'] },
        { group: 'checks', name: 'internal paths', cmd: ['node', 'scripts/check-internal-paths.js'] },
        {
            group: 'checks',
            name: 'script tests',
            cmd: ['npx', 'jest', '--config', 'scripts/jest.config.js', '--no-watchman'],
        },
        ...(base
            ? [
                  {
                      group: 'ratchets',
                      name: 'baselines only go down',
                      cmd: ['node', 'scripts/ratchet.js', 'verify-baseline', '--base', base],
                  },
              ]
            : []),
        ...[
            ['source', 'comments · escape hatches · useEffect'],
            ['knip', 'unused code (knip)'],
            ['jscpd', 'copy-paste (jscpd)'],
            ['testTypecheck', 'test files outside every typecheck'],
        ].map(([kind, name]) => ({
            group: 'ratchets',
            name,
            cmd: ['node', 'scripts/ratchet.js', 'check', '--only', kind, ...(base ? ['--reference', base] : [])],
        })),
        { group: 'lint', name: 'lint', cmd: [...nx, '-t', 'lint'] },
        {
            group: 'typecheck',
            name: 'typecheck (tsc -b)',
            cmd: [...nx, '-t', 'typecheck', `--exclude=${typecheckExclusions()}`],
        },
        { group: 'test', name: 'test', cmd: [...nx, '-t', 'test'] },
    ];
    return steps.filter(step => only.includes(step.group));
};

const runStep = (step, logDir, index) => {
    const log = path.join(logDir, `${String(index).padStart(2, '0')}-${step.name.replace(/\W+/g, '-')}.log`);
    const started = Date.now();
    const result = spawnSync(step.cmd[0], step.cmd.slice(1), {
        cwd: ROOT,
        env: childEnv(),
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const failure = [
        result.error && `could not run: ${result.error.message}`,
        result.signal && `killed by ${result.signal}`,
    ]
        .filter(Boolean)
        .join('\n');
    fs.writeFileSync(
        log,
        `$ ${step.cmd.join(' ')}\n${result.stdout || ''}${result.stderr || ''}${failure ? `\n${failure}\n` : ''}`
    );
    return { ...step, ok: result.status === 0, seconds: (Date.now() - started) / 1000, log };
};

const tail = (file, lines = 40) => fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');

const run = options => {
    const base = options.all ? null : resolveBase(options.base || DEFAULT_BASE);
    const scope = decideScope({ base, changed: base ? changedSince(base, { worktree: true }) : [] });
    const steps = buildSteps({ scope, base, only: options.only });
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dou-gate-'));
    console.log(
        `gate: ${base ? `against ${options.base || DEFAULT_BASE} (${base.slice(0, 9)})` : 'every project'}, nx ${scope[0]}`
    );
    const results = [];
    steps.forEach((step, index) => {
        process.stdout.write(`… ${step.name}`);
        const result = runStep(step, logDir, index);
        results.push(result);
        process.stdout.write(`\r${result.ok ? '✓' : '✗'} ${step.name} (${result.seconds.toFixed(1)}s)\n`);
    });
    const failed = results.filter(result => !result.ok);
    for (const result of failed) console.error(`\n── ${result.name} ── ${result.log}\n${tail(result.log)}`);
    console.log(
        `\ngate: ${failed.length ? `${failed.length} of ${results.length} step(s) failed` : `all ${results.length} steps passed`}; logs in ${logDir}`
    );
    return failed.length ? 1 : 0;
};

const scope = options => {
    const base = options.base || '';
    const changed = base ? changedSince(base, { worktree: false }) : [];
    console.log(decideScope({ base, changed, head: base ? 'HEAD' : null }).join(' '));
    return 0;
};

if (require.main === module) {
    try {
        const options = parseArgs(process.argv.slice(2));
        process.exitCode = options.command === 'scope' ? scope(options) : run(options);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}

module.exports = { parseArgs, decideScope, typecheckExclusions, buildSteps };
