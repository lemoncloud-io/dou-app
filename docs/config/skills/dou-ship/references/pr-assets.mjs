#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const MAX_BYTES = 3 * 1024 * 1024;

const usage = `usage:
  pr-assets.mjs --pr <number> <image>... [--remote origin]
  pr-assets.mjs --pr <number> --remove [--remote origin]
Each PR gets its own orphan branch pr-assets/pr-<number>. Only screenshots of fake data
(web-e2e, fake shell, component harness): the repository is public and git keeps them.`;

const parse = argv => {
    const options = { remote: 'origin', files: [], remove: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--pr') options.pr = argv[(i += 1)];
        else if (arg === '--remote') options.remote = argv[(i += 1)];
        else if (arg === '--remove') options.remove = true;
        else options.files.push(arg);
    }
    return options;
};

export const branchFor = pr => `pr-assets/pr-${pr}`;

const rawBase = (remoteUrl, branch) => {
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${branch}` : `${remoteUrl}#${branch}`;
};

export const publish = ({ pr, files, remote = 'origin', remove = false, cwd = process.cwd() }) => {
    if (!/^\d+$/.test(String(pr ?? ''))) throw new Error(`--pr <number> is required\n${usage}`);
    if (!remove && !files.length) throw new Error(`no images given\n${usage}`);
    for (const file of files) {
        if (!IMAGE.test(file)) throw new Error(`${file}: only png, jpg, gif or webp`);
        if (fs.statSync(file).size > MAX_BYTES) throw new Error(`${file}: larger than 3 MB; crop or scale it`);
    }
    const branch = branchFor(pr);
    const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-assets-')), 'index');
    const git = args =>
        execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, GIT_INDEX_FILE: index },
        }).trim();

    const remoteUrl = git(['remote', 'get-url', remote]);
    const head = git(['ls-remote', '--heads', remote, `refs/heads/${branch}`]).split(/\s+/)[0];
    if (remove) {
        if (head) git(['push', '--quiet', remote, `:refs/heads/${branch}`]);
        return { branch, removed: Boolean(head), urls: [] };
    }
    if (head) {
        git(['fetch', '--quiet', remote, `refs/heads/${branch}`]);
        git(['read-tree', head]);
    } else {
        git(['read-tree', '--empty']);
    }
    const names = files.map(file => {
        const name = path.basename(file).replace(/[^\w.-]/g, '-');
        git(['update-index', '--add', '--cacheinfo', `100644,${git(['hash-object', '-w', file])},${name}`]);
        return name;
    });
    const base = rawBase(remoteUrl, branch);
    const urls = names.map(name => `${base}/${name}`);
    const tree = git(['write-tree']);
    if (head && tree === git(['rev-parse', `${head}^{tree}`])) return { branch, commit: head, urls };
    const commit = git(['commit-tree', tree, ...(head ? ['-p', head] : []), '-m', `add ${names.join(', ')}`]);
    git(['push', '--quiet', remote, `${commit}:refs/heads/${branch}`]);
    return { branch, commit, urls };
};

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    try {
        const { urls, branch, removed } = publish(parse(process.argv.slice(2)));
        if (removed !== undefined) process.stdout.write(removed ? `deleted ${branch}\n` : `${branch} did not exist\n`);
        for (const url of urls) process.stdout.write(`![${path.basename(url, path.extname(url))}](${url})\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
    }
}
