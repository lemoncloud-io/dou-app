const { execFileSync } = require('node:child_process');

function git(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function showOrNull(cwd, rev, path) {
    try {
        return git(['show', `${rev}:${path}`], cwd);
    } catch {
        return null;
    }
}

function parseNumstat(out) {
    const rows = out.split('\0').filter(Boolean);
    return rows.map(row => {
        const [add, del, ...rest] = row.split('\t');
        const path = rest.join('\t');
        const binary = add === '-' && del === '-';
        return { path, additions: binary ? 0 : Number(add), deletions: binary ? 0 : Number(del), binary };
    });
}

function parseNameStatus(out) {
    const parts = out.split('\0').filter(Boolean);
    const status = new Map();
    for (let i = 0; i + 1 < parts.length; i += 2) status.set(parts[i + 1], parts[i][0]);
    return status;
}

/** Changed files between two commits, with lazy before/after content read from git objects. */
function changedFiles({ base, head, cwd }) {
    const numstat = parseNumstat(git(['diff', '--numstat', '-z', '--no-renames', base, head], cwd));
    const status = parseNameStatus(git(['diff', '--name-status', '-z', '--no-renames', base, head], cwd));
    return numstat.map(row => {
        const s = status.get(row.path) || 'M';
        let before;
        let after;
        return {
            ...row,
            status: s === 'A' || s === 'D' || s === 'T' ? s : 'M',
            before: () =>
                before === undefined ? (before = s === 'A' ? null : showOrNull(cwd, base, row.path)) : before,
            after: () => (after === undefined ? (after = s === 'D' ? null : showOrNull(cwd, head, row.path)) : after),
        };
    });
}

function commitsBetween({ base, head, cwd }) {
    const out = git(['log', '--format=%P%x00%s%x1e', `${base}..${head}`], cwd);
    return out
        .split('\x1e')
        .map(s => s.replace(/^\n/, ''))
        .filter(Boolean)
        .map(rec => {
            const [parents, subject] = rec.split('\0');
            return { subject, parents: parents.trim().split(/\s+/).filter(Boolean).length };
        });
}

function mergeBase({ base, head, cwd }) {
    return git(['merge-base', base, head], cwd).trim();
}

module.exports = { changedFiles, commitsBetween, mergeBase, parseNumstat, parseNameStatus, git };
