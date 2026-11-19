#!/usr/bin/env node
/**
 * Hold every app's local env files to one backend per stage — the table in `scripts/env-keys.js`.
 *
 * For each stage file (`apps/<app>/.env.dev`, `.env.prod`, `.env.localhost`) that exists:
 * - a backend key the app carries is set, as the deploy writes it;
 * - `VITE_ENV` says the file's stage;
 * - apps of one group hold the same value for every key they both carry.
 * `.env` itself — the default a plain dev server reads — is only described: which stage's backend it
 * points at, since that differs between apps on purpose today.
 *
 * Values are never printed. They are env files of real endpoints and keys, and a report that went into
 * a log or a pull request would carry them; differing values are named as variants A, B, ….
 *
 * Usage:
 *   node scripts/check-env.js                 # this checkout's apps/*\/.env* files
 *   node scripts/check-env.js --dir <path>    # another tree with the same paths (the secrets repository)
 */
const fs = require('fs');
const path = require('path');

const { APPS, STAGES, STAGE_VALUES } = require('./env-keys');

/** `KEY=value` lines of an env file, surrounding quotes dropped. Comments and blank lines are skipped. */
const parseEnv = text => {
    const values = {};
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match) continue;
        values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return values;
};

const isSet = value => value !== undefined && value !== '';

/**
 * The problems in one stage's files. `files` maps an app to its parsed file, or holds no entry when the
 * app has no file for the stage (an app that is never built for it is not a problem).
 */
const checkStage = (stage, files, apps = APPS) => {
    const problems = [];

    for (const [app, values] of Object.entries(files)) {
        const missing = apps[app].carries.filter(key => !isSet(values[key]));
        if (missing.length > 0) problems.push(`${app}: ${missing.join(', ')} not set`);
        const expected = STAGE_VALUES[stage];
        if (expected && isSet(values.VITE_ENV) && values.VITE_ENV !== expected) {
            problems.push(`${app}: VITE_ENV is not ${expected}`);
        }
    }

    const groups = [...new Set(Object.keys(files).map(app => apps[app].group))];
    for (const group of groups) {
        const members = Object.keys(files).filter(app => apps[app].group === group);
        const keys = [...new Set(members.flatMap(app => apps[app].carries))];
        for (const key of keys) {
            const holders = members.filter(app => apps[app].carries.includes(key) && isSet(files[app][key]));
            const variants = [...new Set(holders.map(app => files[app][key]))];
            if (variants.length < 2) continue;
            const named = variants
                .map((value, i) => {
                    const label = String.fromCharCode(65 + i);
                    return `${label}: ${holders.filter(app => files[app][key] === value).join(', ')}`;
                })
                .join(' | ');
            problems.push(`${key} differs in the ${group} group — ${named}`);
        }
    }
    return problems;
};

/**
 * Keys left out when matching `.env` to a stage: its stage is LOCAL whatever it points at, and its host
 * is the dev server on this machine.
 */
const LOCAL_ONLY_KEYS = new Set(['VITE_ENV', 'VITE_HOST']);

/**
 * Which stage's backend an app's `.env` points at: the stage whose file holds the same value for every
 * key both set, `none` when no stage file matches, `unknown` when there is no stage file to compare.
 */
const describeDefault = (values, stageFiles, carries) => {
    const compared = Object.entries(stageFiles).filter(([, file]) => file);
    if (compared.length === 0) return 'unknown';
    const match = compared.find(([, file]) => {
        const keys = carries.filter(key => !LOCAL_ONLY_KEYS.has(key) && isSet(values[key]) && isSet(file[key]));
        return keys.length > 0 && keys.every(key => file[key] === values[key]);
    });
    return match ? match[0] : 'none';
};

const readEnv = file => (fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : null);

/** Every app's files under `root`, by stage, plus each app's `.env`. */
const readTree = (root, apps = APPS) => {
    const stages = {};
    for (const stage of STAGES) {
        stages[stage] = {};
        for (const app of Object.keys(apps)) {
            const values = readEnv(path.join(root, 'apps', app, `.env.${stage}`));
            if (values) stages[stage][app] = values;
        }
    }
    const defaults = {};
    for (const app of Object.keys(apps)) {
        const values = readEnv(path.join(root, 'apps', app, '.env'));
        if (values) defaults[app] = values;
    }
    return { stages, defaults };
};

/** The report for a tree: its lines, and whether anything failed. */
const report = (tree, apps = APPS) => {
    const lines = [];
    let failed = false;
    for (const stage of STAGES) {
        const files = tree.stages[stage];
        const present = Object.keys(files);
        if (present.length === 0) continue;
        const problems = checkStage(stage, files, apps);
        failed ||= problems.length > 0;
        lines.push(
            `.env.${stage} (${present.join(', ')}): ${problems.length === 0 ? 'ok' : `${problems.length} problem(s)`}`
        );
        for (const problem of problems) lines.push(`  ✗ ${problem}`);
    }
    const defaults = Object.entries(tree.defaults).map(([app, values]) => {
        const stageFiles = Object.fromEntries(STAGES.map(stage => [stage, tree.stages[stage][app]]));
        return `${app} → ${describeDefault(values, stageFiles, apps[app].carries)}`;
    });
    if (defaults.length > 0) lines.push(`.env points at: ${defaults.join(', ')}`);
    if (lines.length === 0) lines.push('No env files found under apps/<app>/.');
    return { lines, failed };
};

if (require.main === module) {
    const at = process.argv.indexOf('--dir');
    const root = at === -1 ? path.resolve(__dirname, '..') : path.resolve(process.argv[at + 1] ?? '.');
    const { lines, failed } = report(readTree(root));
    console.log(lines.join('\n'));
    if (failed) {
        console.error('\nEnv files disagree on a backend. Values are not printed; compare them in the files.');
        process.exit(1);
    }
}

module.exports = { checkStage, describeDefault, parseEnv, readTree, report };
