#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BRANCH = 'pr-assets';
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const MAX_BYTES = 3 * 1024 * 1024;

const usage = `usage:
  pr-assets.mjs --pr <number> <image>... [--remote origin] [--create]
  pr-assets.mjs --pr <number> --remove [--remote origin]
Only screenshots of fake data (web-e2e, fake shell, component harness): the branch is public and permanent.`;

const parse = argv => {
    const options = { remote: 'origin', files: [], create: false, remove: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--pr') options.pr = argv[(i += 1)];
        else if (arg === '--remote') options.remote = argv[(i += 1)];
        else if (arg === '--create') options.create = true;
        else if (arg === '--remove') options.remove = true;
        else options.files.push(arg);
    }
    return options;
};

const rawBase = remoteUrl => {
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${BRANCH}` : null;
};

export const publish = ({ pr, files, remote = 'origin', create = false, remove = false, cwd = process.cwd() }) => {
    if (!/^\d+$/.test(String(pr ?? ''))) throw new Error(`--pr <number> is required\n${usage}`);
    if (!remove && !files.length) throw new Error(`no images given\n${usage}`);
    for (const file of files) {
        if (!IMAGE.test(file)) throw new Error(`${file}: only png, jpg, gif or webp`);
        if (fs.statSync(file).size > MAX_BYTES) throw new Error(`${file}: larger than 3 MB; crop or scale it`);
    }
    const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-assets-')), 'index');
    const git = (args, extra = {}) =>
        execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            ...extra,
            env: { ...process.env, GIT_INDEX_FILE: index, ...(extra.env ?? {}) },
        }).trim();

    const remoteUrl = git(['remote', 'get-url', remote]);
    const head = git(['ls-remote', '--heads', remote, BRANCH]).split(/\s+/)[0];
    if (!head && !create) {
        throw new Error(
            `${remote} has no ${BRANCH} branch. Creating it is the repository owner's call; rerun with --create once they agree.`
        );
    }
    if (head) {
        git(['fetch', '--quiet', remote, `refs/heads/${BRANCH}`]);
        git(['read-tree', head]);
    } else {
        git(['read-tree', '--empty']);
    }
    const folder = `pr-${pr}`;
    if (remove) {
        git(['rm', '--cached', '-r', '--quiet', '--ignore-unmatch', folder]);
    }
    const names = [];
    for (const file of files) {
        const name = path.basename(file).replace(/[^\w.-]/g, '-');
        const blob = git(['hash-object', '-w', file]);
        git(['update-index', '--add', '--cacheinfo', `100644,${blob},${folder}/${name}`]);
        names.push(name);
    }
    const base = rawBase(remoteUrl);
    const urls = names.map(name => (base ? `${base}/${folder}/${name}` : `${remoteUrl}#${BRANCH}:${folder}/${name}`));
    const tree = git(['write-tree']);
    if (head && tree === git(['rev-parse', `${head}^{tree}`])) return { commit: head, urls };
    const message = remove ? `remove ${folder}` : `add ${names.join(', ')} to ${folder}`;
    const commit = git(['commit-tree', tree, ...(head ? ['-p', head] : []), '-m', message]);
    git(['push', '--quiet', remote, `${commit}:refs/heads/${BRANCH}`]);
    return { commit, urls };
};

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    try {
        const { urls } = publish(parse(process.argv.slice(2)));
        for (const url of urls) process.stdout.write(`![${path.basename(url, path.extname(url))}](${url})\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
    }
}
