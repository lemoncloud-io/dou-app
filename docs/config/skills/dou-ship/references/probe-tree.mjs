#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_UNTRACKED_FILES = 2000;
const MAX_UNTRACKED_BYTES = 50 * 1024 * 1024;
const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (args, env) =>
    execFileSync('git', args, {
        cwd: top,
        env: env ?? process.env,
        encoding: 'utf8',
        maxBuffer: 1 << 28,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
const fail = message => {
    console.error(message);
    process.exit(1);
};
const args = process.argv.slice(2);

if (args[0] === '--remove') {
    const tree = path.resolve(args[1] ?? '');
    if (!path.basename(tree).startsWith('dou-probe-')) {
        fail(`not a probe tree: ${tree}`);
    }
    if (fs.existsSync(tree)) {
        git(['worktree', 'remove', '--force', tree]);
    } else {
        git(['worktree', 'prune']);
    }
    process.exit(0);
}

const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const bytes = untracked.reduce((sum, file) => {
    const stat = fs.lstatSync(path.join(top, file), { throwIfNoEntry: false });
    return sum + (stat?.isFile() ? stat.size : 0);
}, 0);
if (untracked.length > MAX_UNTRACKED_FILES || bytes > MAX_UNTRACKED_BYTES) {
    fail(`refusing: ${untracked.length} untracked files (${bytes} bytes) are not ignored; ignore or move them first`);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dou-probe-index-'));
let snapshot;
try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(scratch, 'index') };
    git(['read-tree', 'HEAD'], env);
    try {
        git(['add', '--all', '--', '.'], env);
    } catch (error) {
        throw new Error(`git add could not snapshot this tree: ${String(error.stderr ?? error.message).trim()}`);
    }
    const tree = git(['write-tree'], env);
    snapshot = git(['commit-tree', tree, '-p', 'HEAD', '-m', 'probe snapshot'], {
        ...env,
        GIT_AUTHOR_NAME: 'probe',
        GIT_AUTHOR_EMAIL: 'probe@example.invalid',
        GIT_COMMITTER_NAME: 'probe',
        GIT_COMMITTER_EMAIL: 'probe@example.invalid',
    });
} catch (error) {
    fs.rmSync(scratch, { recursive: true, force: true });
    fail(error.message);
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}

const root = process.env.DOU_PROBE_ROOT ?? os.tmpdir();
fs.mkdirSync(root, { recursive: true });
const probe = fs.mkdtempSync(path.join(root, 'dou-probe-'));
try {
    git(['worktree', 'add', '--detach', '--quiet', probe, snapshot]);
    const main = path.dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
    const modules = [path.join(top, 'node_modules'), path.join(main, 'node_modules')].find(p => fs.existsSync(p));
    if (!modules) {
        throw new Error('no node_modules found in this checkout or the main one: tests cannot run');
    }
    fs.symlinkSync(fs.realpathSync(modules), path.join(probe, 'node_modules'));
} catch (error) {
    try {
        git(['worktree', 'remove', '--force', probe]);
    } catch {
        fs.rmSync(probe, { recursive: true, force: true });
        git(['worktree', 'prune']);
    }
    fail(String(error.message ?? error));
}
console.log(probe);
