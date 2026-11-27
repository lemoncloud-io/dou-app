#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const baseline = require('./ratchet/baseline');
const { ROOT, git, renamesSince, showAt } = require('./ratchet/files');

const KINDS = {
    source: () => require('./ratchet/source'),
    knip: () => require('./ratchet/knip'),
    jscpd: () => require('./ratchet/jscpd'),
    testTypecheck: () => require('./ratchet/test-typecheck'),
};

const PER_FILE_KINDS = ['source', 'testTypecheck'];

const MODES_FILE = path.join(__dirname, 'ratchet/modes.json');
const MODES = ['off', 'observe', 'enforce'];

const readModes = (text = fs.readFileSync(MODES_FILE, 'utf8')) => {
    const modes = JSON.parse(text);
    for (const kind of Object.keys(KINDS)) {
        if (!MODES.includes(modes[kind]))
            throw new Error(`ratchet/modes.json: ${kind} must be one of ${MODES.join(', ')}`);
    }
    return modes;
};

const USAGE = `Usage:
  node scripts/ratchet.js check [--only source,knip,jscpd,testTypecheck] [--reference <ref>] [--lower]   # --lower writes a lowered baseline instead of failing
  node scripts/ratchet.js update [--only ...] [--base <ref>]   # follows renames since the merge base with origin/develop
  node scripts/ratchet.js verify-baseline --base <ref> [--head <ref>]   # --head reads the baselines from that commit, not the tree
  node scripts/ratchet.js init [--only ...] [--force]`;

const parseArgs = argv => {
    const [command, ...rest] = argv;
    const options = { command, only: Object.keys(KINDS), base: null, head: null, reference: null, force: false };
    for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--only') options.only = rest[++i].split(',').filter(Boolean);
        else if (rest[i] === '--base') options.base = rest[++i];
        else if (rest[i] === '--head') options.head = rest[++i];
        else if (rest[i] === '--reference') options.reference = rest[++i];
        else if (rest[i] === '--force') options.force = true;
        else if (rest[i] === '--lower') options.lower = true;
        else throw new Error(`unknown argument ${rest[i]}\n${USAGE}`);
    }
    for (const kind of options.only) if (!KINDS[kind]) throw new Error(`unknown kind ${kind}\n${USAGE}`);
    return options;
};

const relative = file => path.relative(ROOT, file);
const describe = ({ path: at, count, allowed }) => `  ${at.join(' > ')}: ${count} (baseline ${allowed})`;

const measureKind = kind => {
    const module = KINDS[kind]();
    const started = Date.now();
    const measured = module.measure();
    const result = kind === 'source' ? measured.result : measured;
    if (kind === 'source' && measured.failures.length) {
        const list = measured.failures.map(f => `  ${f.file}: ${f.message}`).join('\n');
        throw new Error(`could not parse ${measured.failures.length} file(s):\n${list}`);
    }
    return { module, result, seconds: ((Date.now() - started) / 1000).toFixed(1) };
};

const report = (mode, lines) => {
    const print = mode === 'enforce' ? console.error : console.log;
    print(lines.join('\n'));
    if (mode !== 'observe' || !process.env.GITHUB_ACTIONS) return;
    console.log(
        `::warning title=ratchet (observe)::${lines[0].replace(/^✗ /, '')} — reported only, the check is in observe mode`
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(
            process.env.GITHUB_STEP_SUMMARY,
            `### ratchet, observe mode\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`
        );
    }
};

const referenceBaseline = (module, ref) => {
    if (!ref) return null;
    const text = showAt(ref, relative(module.BASELINE_FILE));
    return text === null ? null : JSON.parse(text);
};

const check = (options, modes = readModes()) => {
    let failed = false;
    for (const kind of options.only) {
        const mode = modes[kind];
        if (mode === 'off') {
            console.log(`- ${kind}: off`);
            continue;
        }
        const { module, result, seconds } = measureKind(kind);
        const current = baseline.read(module.BASELINE_FILE);
        if (!current) {
            report(mode, [
                `✗ ${kind}: ${relative(module.BASELINE_FILE)} is missing — run \`yarn ratchet init --only ${kind}\``,
            ]);
            failed = failed || mode === 'enforce';
            continue;
        }
        const reference = referenceBaseline(module, options.reference);
        const allowed = reference
            ? baseline.lower(baseline.followRenames(reference, renamesSince(options.reference)), current)
            : current;
        let { over } = baseline.compare(result, allowed);
        const { under } = baseline.compare(result, current);
        if (!over.length && !under.length) {
            console.log(`✓ ${kind} (${seconds}s, ${mode})`);
            continue;
        }
        if (under.length && options.lower) {
            const next = lowerBaseline(module, result, options.reference);
            const nextAllowed = reference
                ? baseline.lower(baseline.followRenames(reference, renamesSince(options.reference)), next)
                : next;
            over = baseline.compare(result, nextAllowed).over;
            const after = baseline.flatten(baseline.prune(next));
            const changed = [...baseline.flatten(baseline.prune(current))]
                .filter(([leaf, count]) => after.get(leaf) !== count)
                .map(
                    ([leaf, count]) =>
                        `  ${JSON.parse(leaf).join(' > ')}: ${count} → ${after.get(leaf) ?? 'moved or 0'}`
                );
            console.log([`↓ ${kind}: lowered ${relative(module.BASELINE_FILE)} — commit it`, ...changed].join('\n'));
            under.length = 0;
            if (!over.length) continue;
        }
        const underMode = PER_FILE_KINDS.includes(kind) ? mode : 'observe';
        failed = failed || (mode === 'enforce' && over.length > 0) || (underMode === 'enforce' && under.length > 0);
        const label = mode === 'enforce' ? '✗' : '! (observe)';
        if (over.length) {
            const against = reference ? `the baseline (no higher than on ${options.reference})` : 'the baseline';
            report(mode, [
                `${label} ${kind}: ${over.length} count(s) above ${against} (${seconds}s)`,
                ...over.map(describe),
            ]);
        }
        if (under.length) {
            report(underMode, [
                `${underMode === 'enforce' ? '✗' : '!'} ${kind}: ${under.length} count(s) below the baseline — \`yarn gate\` lowers and stages it (or \`yarn ratchet:update\`); commit ${relative(module.BASELINE_FILE)}`,
                ...under.map(describe),
            ]);
        }
    }
    return failed ? 1 : 0;
};

const lowerBaseline = (module, result, base) => {
    const current = baseline.read(module.BASELINE_FILE);
    if (!current) throw new Error(`${relative(module.BASELINE_FILE)} is missing — run \`yarn ratchet init\``);
    const from = base || defaultBase();
    const next = baseline.lower(baseline.followRenames(current, from ? renamesSince(from) : new Map()), result);
    baseline.write(module.BASELINE_FILE, next);
    return next;
};

const update = options => {
    for (const kind of options.only) {
        const { module, result } = measureKind(kind);
        const next = lowerBaseline(module, result, options.base);
        const { over } = baseline.compare(result, next);
        console.log(`${kind}: baseline lowered; ${over.length} count(s) still above it`);
    }
    return 0;
};

const defaultBase = () => {
    try {
        return git(['merge-base', 'origin/develop', 'HEAD']).trim();
    } catch {
        return null;
    }
};

const init = options => {
    for (const kind of options.only) {
        const { module, result } = measureKind(kind);
        if (baseline.read(module.BASELINE_FILE) && !options.force) {
            throw new Error(`${relative(module.BASELINE_FILE)} exists; init only creates a missing baseline`);
        }
        baseline.write(module.BASELINE_FILE, result);
        console.log(`${kind}: wrote ${relative(module.BASELINE_FILE)}`);
    }
    return 0;
};

const verifyBaseline = options => {
    if (!options.base) throw new Error(`verify-baseline needs --base <ref>\n${USAGE}`);
    const renames = renamesSince(options.base, options.head);
    const range = options.head ? `${options.base}..${options.head}` : options.base;
    let failed = false;
    for (const kind of Object.keys(KINDS)) {
        const file = KINDS[kind]().BASELINE_FILE;
        const before = showAt(options.base, relative(file));
        const headText = options.head ? showAt(options.head, relative(file)) : null;
        const after = options.head ? (headText === null ? null : JSON.parse(headText)) : baseline.read(file);
        if (before === null || after === null) {
            console.log(`- ${relative(file)}: not on both sides, nothing to compare`);
            continue;
        }
        const problems = baseline.increases(JSON.parse(before), after, renames);
        if (!problems.length) {
            console.log(`✓ ${relative(file)} only went down`);
            continue;
        }
        failed = true;
        console.error(`✗ ${relative(file)} was raised in ${range}; a baseline may only go down:`);
        console.error(problems.map(describe).join('\n'));
    }
    return failed ? 1 : 0;
};

const COMMANDS = { check, update, init, 'verify-baseline': verifyBaseline };

const main = argv => {
    const options = parseArgs(argv);
    const command = COMMANDS[options.command];
    if (!command) throw new Error(USAGE);
    return command(options);
};

if (require.main === module) {
    try {
        process.exitCode = main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}

module.exports = { main, parseArgs, readModes, check };
