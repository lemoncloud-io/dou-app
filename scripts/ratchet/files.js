'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(process.env.RATCHET_ROOT || path.join(__dirname, '../..'));

const git = (args, options = {}) =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });

const listFiles = patterns =>
    [
        ...new Set(
            git(['ls-files', '--cached', '--others', '--exclude-standard', '--', ...patterns])
                .split('\n')
                .filter(Boolean)
        ),
    ]
        .filter(file => fs.existsSync(path.join(ROOT, file)))
        .sort();

const renamesSince = base => {
    const renames = new Map();
    const out = git(['diff', '--name-status', '-M', base, '--']);
    for (const line of out.split('\n')) {
        const [status, from, to] = line.split('\t');
        if (status && status.startsWith('R') && from && to) renames.set(from, to);
    }
    return renames;
};

const showAt = (ref, file) => {
    try {
        return git(['show', `${ref}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return null;
    }
};

module.exports = { ROOT, git, listFiles, renamesSince, showAt };
