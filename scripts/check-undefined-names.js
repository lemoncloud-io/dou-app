#!/usr/bin/env node
/**
 * Fail on any identifier that is used but never bound — TypeScript's TS2304,
 * "Cannot find name 'x'".
 *
 * Why this exists as its own gate: nothing else in the repo can see that error.
 * `vite build` strips types without resolving free identifiers, so an unimported
 * name compiles to a global lookup and the failure moves to runtime.
 * `typescript-eslint` disables `no-undef` on TypeScript files by design, on the
 * grounds that the type checker owns this class. And a test only catches it if
 * something renders the offending line, which for a memo in a component nobody
 * has a spec for means never. That combination shipped a chat pane that crashed
 * behind an error boundary — see `.claude/20260804/DEBUG-10-36-17.md`.
 *
 * The obvious gate, a plain `tsc -b`, is unusable here: project references
 * cascade pre-existing errors across the whole graph, so the signal drowns.
 * TS2304 is picked out on its own because it is a disjoint set from that noise
 * (which is TS2339 / TS6305 / TS6059) and because it has no false positives —
 * an unbound identifier is a guaranteed ReferenceError the moment the line runs.
 *
 * Usage:
 *   node scripts/check-undefined-names.js              # every app and lib
 *   node scripts/check-undefined-names.js desktop-web  # only matching projects
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TSC = path.join(ROOT, 'node_modules', '.bin', 'tsc');
const ERROR_CODE = 'error TS2304';
/** tsc is single-threaded per project; this many at once saturates a laptop without thrashing. */
const CONCURRENCY = 4;

/** Every buildable project: an app's `tsconfig.app.json` or a lib's `tsconfig.lib.json`. */
const findProjects = () => {
    const found = [];
    for (const group of ['apps', 'libs']) {
        const groupDir = path.join(ROOT, group);
        if (!fs.existsSync(groupDir)) continue;
        for (const name of fs.readdirSync(groupDir).sort()) {
            for (const file of ['tsconfig.app.json', 'tsconfig.lib.json']) {
                const configPath = path.join(groupDir, name, file);
                if (fs.existsSync(configPath)) found.push({ name: `${group}/${name}`, configPath });
            }
        }
    }
    return found;
};

/**
 * Type-check one project and return only its TS2304 lines.
 *
 * Deliberately ignores the exit code: tsc exits non-zero for the pre-existing
 * errors this gate is built to look past, so the offending lines are the result,
 * not the status.
 */
const findUndefinedNames = project =>
    new Promise(resolve => {
        const tsc = spawn(TSC, ['--noEmit', '-p', project.configPath], { cwd: ROOT });
        let output = '';
        tsc.stdout.on('data', chunk => (output += chunk));
        tsc.stderr.on('data', chunk => (output += chunk));
        tsc.on('close', () => resolve(output.split('\n').filter(line => line.includes(ERROR_CODE))));
        tsc.on('error', error => resolve([`${project.name}: could not run tsc — ${error.message}`]));
    });

const checkAll = async projects => {
    const failures = [];
    const queue = [...projects];
    const worker = async () => {
        for (let project = queue.shift(); project; project = queue.shift()) {
            const lines = await findUndefinedNames(project);
            process.stdout.write(lines.length ? 'x' : '.');
            failures.push(...lines);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return failures;
};

const main = async () => {
    const filter = process.argv[2];
    const projects = findProjects().filter(project => !filter || project.name.includes(filter));
    if (!projects.length) {
        console.error(filter ? `No project matches "${filter}".` : 'No projects found.');
        process.exit(1);
    }

    process.stdout.write(`Checking ${projects.length} project(s) for undefined names `);
    const failures = await checkAll(projects);
    console.log('');

    if (!failures.length) {
        console.log(`No undefined names. (${ERROR_CODE} count: 0)`);
        return;
    }

    console.error(`\n${failures.length} undefined name(s) — each one throws a ReferenceError when reached:\n`);
    failures.forEach(line => console.error(`  ${line.trim()}`));
    console.error('\nUsually a missing import. Add the symbol to the import list at the top of the file.');
    process.exit(1);
};

main();
