#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const LOCAL_FILE_PATHSPECS = [
    ':(glob).env',
    ':(glob).env.*',
    ':(glob)apps/*/.env',
    ':(glob)apps/*/.env.*',
    ':(glob)apps/mobile/ios/Firebase/*.plist',
    ':(glob)apps/mobile/android/app/src/*/google-services.json',
];
const NOT_LOCAL_FILE = /\.example$|signing/;

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const findMainCheckout = root => {
    const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']));
    return path.dirname(fs.realpathSync(common));
};

const isInside = (root, file) => {
    const relative = path.relative(root, file);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const listLocalFiles = main =>
    git(main, ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...LOCAL_FILE_PATHSPECS])
        .split('\n')
        .filter(file => file && !NOT_LOCAL_FILE.test(file))
        .sort();

const describeSource = (main, relative) => {
    const source = path.join(main, relative);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink())
        return { kind: 'link', target: path.resolve(path.dirname(source), fs.readlinkSync(source)) };
    return { kind: 'copy', source };
};

const planLocalFile = ({ root, relative, source, existing }) => {
    const destination = path.join(root, relative);
    if (!isInside(root, destination)) throw new Error(`refusing to write outside the worktree: ${relative}`);
    if (existing) {
        const same = existing.kind === 'link' && source.kind === 'link' && existing.target === source.target;
        return { root, relative, destination, action: same ? 'linked already' : 'kept (exists)' };
    }
    return { root, relative, destination, action: source.kind === 'link' ? 'link' : 'copy', source };
};

const describeExisting = destination => {
    let stat;
    try {
        stat = fs.lstatSync(destination);
    } catch {
        return null;
    }
    if (stat.isSymbolicLink()) {
        return { kind: 'link', target: path.resolve(path.dirname(destination), fs.readlinkSync(destination)) };
    }
    return { kind: 'file' };
};

const applyLocalFile = plan => {
    if (plan.action !== 'link' && plan.action !== 'copy') return;
    fs.mkdirSync(path.dirname(plan.destination), { recursive: true });
    const realDirectory = fs.realpathSync(path.dirname(plan.destination));
    if (!isInside(fs.realpathSync(plan.root), path.join(realDirectory, path.basename(plan.destination)))) {
        throw new Error(`refusing to write outside the worktree: ${plan.relative}`);
    }
    if (plan.action === 'link') fs.symlinkSync(plan.source.target, plan.destination);
    else fs.copyFileSync(plan.source.source, plan.destination, fs.constants.COPYFILE_EXCL);
};

const setupLocalFiles = ({ root, mainCheckout, dryRun }) =>
    listLocalFiles(mainCheckout).map(relative => {
        const plan = planLocalFile({
            root,
            relative,
            source: describeSource(mainCheckout, relative),
            existing: describeExisting(path.join(root, relative)),
        });
        if (!dryRun) applyLocalFile(plan);
        return plan;
    });

const parseLockfile = text => {
    const entries = new Map();
    let patterns = null;
    for (const line of text.split(/\r?\n/)) {
        if (/^\S.*:$/.test(line) && !line.startsWith('#')) {
            patterns = line
                .slice(0, -1)
                .split(/,\s*/)
                .map(pattern => pattern.replace(/^"|"$/g, ''));
        } else if (patterns && /^ {2}resolved /.test(line)) {
            const resolved = line.replace(/^ {2}resolved\s+/, '').replace(/^"|"$/g, '');
            for (const pattern of patterns) entries.set(pattern, resolved);
            patterns = null;
        }
    }
    return entries;
};

const nodeModulesDrift = root => {
    let integrity;
    try {
        integrity = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/.yarn-integrity'), 'utf8'));
    } catch {
        return { inSync: false, reason: 'node_modules has no yarn integrity file' };
    }
    const lock = parseLockfile(fs.readFileSync(path.join(root, 'yarn.lock'), 'utf8'));
    const installed = integrity.lockfileEntries || {};
    const missing = [...lock]
        .filter(([pattern, resolved]) => installed[pattern] !== resolved)
        .map(([pattern]) => pattern);
    const extra = Object.keys(installed).filter(pattern => !lock.has(pattern));
    if (!missing.length && !extra.length) return { inSync: true };
    return {
        inSync: false,
        reason: `${missing.length} lockfile entr${missing.length === 1 ? 'y differs' : 'ies differ'} from node_modules, ${extra.length} installed entr${extra.length === 1 ? 'y is' : 'ies are'} gone from yarn.lock`,
        sample: [...missing, ...extra].slice(0, 5),
    };
};

const run = (root, cmd, args, env = {}) =>
    spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, NX_DAEMON: 'false', ...env } }).status;

const dirtyFiles = root =>
    execFileSync('git', ['status', '--porcelain', '-z', '--no-renames'], { cwd: root, encoding: 'utf8' })
        .split('\0')
        .filter(Boolean)
        .map(entry => entry.slice(3));

const main = ({ root = ROOT, dryRun = false } = {}) => {
    const mainCheckout = findMainCheckout(root);
    if (fs.realpathSync(root) === fs.realpathSync(mainCheckout)) {
        console.error('worktree:setup prepares a linked worktree; this is the main checkout. Nothing was changed.');
        return 2;
    }
    let failed = false;
    console.log(
        `worktree: ${root}\nmain checkout: ${mainCheckout}\n\nenv and Firebase files (values are never printed):`
    );
    for (const plan of setupLocalFiles({ root, mainCheckout, dryRun }))
        console.log(`  ${plan.action.padEnd(15)} ${plan.relative}`);

    const tokenSet = Boolean(process.env.NODE_AUTH_TOKEN);
    console.log(`\nNODE_AUTH_TOKEN: ${tokenSet ? 'set' : 'not set'}`);

    const drift = nodeModulesDrift(root);
    if (drift.inSync) {
        console.log('node_modules: matches yarn.lock');
    } else {
        console.log(`node_modules: ${drift.reason}${drift.sample ? ` (e.g. ${drift.sample.join(', ')})` : ''}`);
        if (dryRun) {
            console.log('  would run: SKIP_MOBILE_POD=1 yarn install --frozen-lockfile');
        } else if (!tokenSet) {
            console.error(
                '  cannot install: the private registry needs NODE_AUTH_TOKEN (see .npmrc). Export it in this shell and run again.'
            );
            failed = true;
        } else {
            const mobilePackage = 'apps/mobile/package.json';
            const mobileWasClean = !dirtyFiles(root).includes(mobilePackage);
            const status = run(root, 'yarn', ['install', '--frozen-lockfile'], { SKIP_MOBILE_POD: '1' });
            if (status !== 0) failed = true;
            if (mobileWasClean && dirtyFiles(root).includes(mobilePackage)) {
                git(root, ['checkout', '--', mobilePackage]);
                console.log(`  restored ${mobilePackage}, which the install rewrote`);
            }
        }
    }

    if (dryRun) {
        console.log('\nnx sync: skipped (dry run)');
    } else {
        const before = new Set(dirtyFiles(root));
        const status = run(root, 'npx', ['nx', 'sync'], { NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || 'unused' });
        const changed = dirtyFiles(root).filter(file => !before.has(file));
        if (status !== 0) failed = true;
        console.log(
            changed.length
                ? `\nnx sync changed ${changed.length} file(s) — develop is out of sync; keep them out of an unrelated PR:\n${changed.map(file => `  ${file}`).join('\n')}`
                : '\nnx sync: nothing to change'
        );
    }
    return failed ? 1 : 0;
};

if (require.main === module) {
    const args = process.argv.slice(2);
    const unknown = args.filter(arg => arg !== '--dry-run');
    if (unknown.length) {
        console.error(`unknown argument ${unknown[0]}\nUsage: yarn worktree:setup [--dry-run]`);
        process.exitCode = 2;
    } else {
        try {
            process.exitCode = main({ dryRun: args.includes('--dry-run') });
        } catch (error) {
            console.error(error.message);
            process.exitCode = 2;
        }
    }
}

module.exports = {
    dirtyFiles,
    findMainCheckout,
    listLocalFiles,
    planLocalFile,
    setupLocalFiles,
    parseLockfile,
    nodeModulesDrift,
    isInside,
    main,
};
