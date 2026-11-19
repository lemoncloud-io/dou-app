#!/usr/bin/env node
/**
 * Hold every app's local env files to one backend per stage — the table in `scripts/env-keys.js`.
 *
 * What a build reads is checked, not each file alone. For an app that reads the shared files, a stage's
 * values are what Nx loads for `--configuration=<stage>`: the app's `.env.<stage>`, then its `.env`, then
 * the root `.env.<stage>`, the first file to set a key keeping it. An app that does not read them (the
 * phone app) is its own `.env.<stage>`. For each stage:
 * - a backend key the app carries is set, as the deploy writes it;
 * - `VITE_ENV` says the stage, in the shared file too;
 * - apps of one group hold the same value for every key they both carry;
 * - a key in an app's `.env` that overrides the shared file's in that stage, which Nx's order makes
 *   easy to miss, fails.
 * A key an app's own file still holds beside the shared file is noted, not failed: the app's copy wins
 * until it is deleted. What `nx serve` talks to is described, not checked.
 *
 * Values are never printed. They are env files of real endpoints and keys, and a report that went into
 * a log or a pull request would carry them; differing values are named as variants A, B, ….
 *
 * Usage:
 *   node scripts/check-env.js                 # this checkout's env files
 *   node scripts/check-env.js --dir <path>    # another tree with the same paths (the secrets repository)
 */
const fs = require('fs');
const path = require('path');

const { APPS, BACKEND_KEYS, SHARED_FILES, STAGES, STAGE_VALUES } = require('./env-keys');

/** The group whose keys the shared files hold. */
const SHARED_GROUP = 'web';

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

/** Only the set keys of a file, so a blank line in an earlier file does not hide a later file's value. */
const setOnly = values => Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => isSet(value)));

/**
 * What an app's build of `stage` reads, or null when it reads nothing for that stage. Nx keeps the first
 * value it loads, so the earlier files are spread last here.
 */
const effectiveValues = (app, stage, tree, apps = APPS) => {
    const own = tree.stages[stage]?.[app];
    const { readsShared, group } = apps[app];
    if (!readsShared) return own ? setOnly(own) : null;
    const shared = tree.shared[stage];
    // Only the shared group's apps are built from the shared file alone; another app is checked where it
    // has a file of its own.
    if (!own && !(shared && group === SHARED_GROUP)) return null;
    return { ...setOnly(shared), ...setOnly(tree.defaults[app]), ...setOnly(own) };
};

/**
 * The problems in one stage's builds. `files` maps an app to what its build reads; an app that is never
 * built for the stage has no entry.
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
 * What the shared file of `stage` adds to the report: its own stage problem, a key in an app's `.env` that
 * overrides it (a problem), and the apps whose own stage file still holds keys it holds (a note).
 */
const checkShared = (stage, tree, apps = APPS) => {
    const shared = setOnly(tree.shared[stage]);
    const problems = [];
    const notes = [];
    if (!tree.shared[stage]) return { problems, notes };

    const expected = STAGE_VALUES[stage];
    if (expected && isSet(shared.VITE_ENV) && shared.VITE_ENV !== expected) {
        problems.push(`shared ${SHARED_FILES[stage]}: VITE_ENV is not ${expected}`);
    }

    const readers = Object.keys(apps).filter(app => apps[app].readsShared && apps[app].group === SHARED_GROUP);
    for (const app of readers) {
        const own = setOnly(tree.stages[stage]?.[app]);
        const fallback = setOnly(tree.defaults[app]);
        const overriding = BACKEND_KEYS.filter(
            key => !isSet(own[key]) && isSet(fallback[key]) && isSet(shared[key]) && fallback[key] !== shared[key]
        );
        if (overriding.length > 0) {
            problems.push(
                `${app}: ${overriding.join(', ')} in its .env override the shared ${SHARED_FILES[stage]} — ` +
                    'Nx loads an app’s .env before any root file'
            );
        }
        const duplicated = BACKEND_KEYS.filter(key => isSet(own[key]) && isSet(shared[key]));
        if (duplicated.length > 0) {
            notes.push(`${app}: ${duplicated.length} backend key(s) in its own .env.${stage} win over the shared file`);
        }
    }
    return { problems, notes };
};

/**
 * Keys left out when matching a dev server's values to a stage: its stage is LOCAL whatever it points at,
 * and its host is the dev server on this machine.
 */
const LOCAL_ONLY_KEYS = new Set(['VITE_ENV', 'VITE_HOST']);

/**
 * Which stage's backend `values` point at: the stage whose values match on every key both set, `none` when
 * no stage matches, `unknown` when there is no stage to compare.
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

/** Every app's files under `root` by stage, each app's `.env`, and the shared root files. */
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
    const shared = Object.fromEntries(
        Object.entries(SHARED_FILES).map(([name, file]) => [name, readEnv(path.join(root, file))])
    );
    return { stages, defaults, shared };
};

/** What a dev server of `app` reads: `nx serve` loads the app's `.env`, then the shared serve file. */
const serveValues = (app, tree, apps = APPS) => {
    const own = tree.defaults[app];
    const shared = apps[app].readsShared ? tree.shared.serve : null;
    if (!own && !(shared && apps[app].group === SHARED_GROUP)) return null;
    return { ...setOnly(shared), ...setOnly(own) };
};

/** The report for a tree: its lines, and whether anything failed. */
const report = (tree, apps = APPS) => {
    const lines = [];
    let failed = false;
    for (const stage of STAGES) {
        const files = {};
        for (const app of Object.keys(apps)) {
            const values = effectiveValues(app, stage, tree, apps);
            if (values) files[app] = values;
        }
        const present = Object.keys(files);
        if (present.length === 0) continue;
        const shared = checkShared(stage, tree, apps);
        const problems = [...shared.problems, ...checkStage(stage, files, apps)];
        failed ||= problems.length > 0;
        const readers = tree.shared[stage] ? ['shared', ...present] : present;
        lines.push(
            `.env.${stage} (${readers.join(', ')}): ${problems.length === 0 ? 'ok' : `${problems.length} problem(s)`}`
        );
        for (const problem of problems) lines.push(`  ✗ ${problem}`);
        for (const note of shared.notes) lines.push(`  · ${note}`);
    }
    const served = Object.keys(apps)
        .map(app => {
            const values = serveValues(app, tree, apps);
            if (!values) return null;
            const stageFiles = Object.fromEntries(
                STAGES.map(stage => [stage, effectiveValues(app, stage, tree, apps)])
            );
            return `${app} → ${describeDefault(values, stageFiles, apps[app].carries)}`;
        })
        .filter(Boolean);
    if (served.length > 0) lines.push(`a dev server talks to: ${served.join(', ')}`);
    if (lines.length === 0) lines.push('No env files found under apps/<app>/ or at the root.');
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

module.exports = { checkShared, checkStage, describeDefault, effectiveValues, parseEnv, readTree, report };
