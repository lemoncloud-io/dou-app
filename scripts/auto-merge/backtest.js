#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { classify } = require('./classify');
const { changedFiles, mergeBase, git } = require('./git-input');
const rules = require('./rules');

const FOLLOW_UP_DAYS = 30;

function gh(args) {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function cached(dir, name, produce) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const value = produce();
    fs.writeFileSync(file, JSON.stringify(value));
    return value;
}

function prCommits(repo, number) {
    const out = gh([
        'api',
        '--paginate',
        `repos/${repo}/pulls/${number}/commits`,
        '--jq',
        '.[] | [.sha, (.parents|length), (.commit.message|split("\\n")[0])] | @json',
    ]);
    return out
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [sha, parents, subject] = JSON.parse(line);
            return { sha, parents, subject };
        });
}

function rangeOf(merge, cwd) {
    const parents = git(['rev-list', '--parents', '-n', '1', merge], cwd).trim().split(' ').slice(1);
    if (parents.length === 2) {
        return { base: mergeBase({ base: parents[0], head: parents[1], cwd }), head: parents[1], squash: false };
    }
    return { base: parents[0], head: merge, squash: true };
}

function hunksOldSide(diff) {
    const ranges = [];
    for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
        const start = Number(m[1]);
        const len = m[2] === undefined ? 1 : Number(m[2]);
        if (len > 0) ranges.push([start, start + len - 1]);
    }
    return ranges;
}

/**
 * A later `fix` commit counts as a follow-up when `git blame` on its parent attributes a line it
 * removed or rewrote to one of this pull request's commits.
 */
function followUpFixes({ prShas, merge, mergedAt, files, cwd }) {
    const until = new Date(new Date(mergedAt).getTime() + FOLLOW_UP_DAYS * 864e5).toISOString();
    const hits = [];
    for (const file of files) {
        if (rules.isTestFile(file)) continue;
        const log = git(
            ['log', '--no-merges', `--until=${until}`, '--format=%H%x00%s', `${merge}..origin/develop`, '--', file],
            cwd
        );
        for (const line of log.split('\n').filter(Boolean)) {
            const [sha, subject] = line.split('\0');
            if (!/^fix(\(|:)/.test(subject)) continue;
            const ranges = hunksOldSide(git(['diff', '-U0', `${sha}^`, sha, '--', file], cwd));
            for (const [a, b] of ranges) {
                let blame = '';
                try {
                    blame = git(['blame', '-l', '-s', '-L', `${a},${b}`, `${sha}^`, '--', file], cwd);
                } catch {
                    continue;
                }
                const owners = new Set(
                    blame
                        .split('\n')
                        .filter(Boolean)
                        .map(l => l.slice(0, 40))
                );
                if ([...owners].some(o => prShas.has(o))) {
                    hits.push({ sha: sha.slice(0, 9), subject, file });
                    break;
                }
            }
        }
    }
    return hits;
}

function reverts({ prShas, title, cwd }) {
    const log = git(['log', '--format=%H%x00%s%x00%b%x1e', '--grep=^Revert', '-i', 'origin/develop'], cwd);
    const hits = [];
    for (const rec of log.split('\x1e').filter(s => s.trim())) {
        const [sha, subject, body] = rec.replace(/^\n/, '').split('\0');
        const named = [...(body || '').matchAll(/reverts commit ([0-9a-f]{7,40})/gi)].map(m => m[1]);
        const hitSha = named.some(n => [...prShas].some(s => s.startsWith(n)));
        if (hitSha || subject === `Revert "${title}"`) hits.push({ sha: sha.slice(0, 9), subject });
    }
    return hits;
}

function main() {
    const [prsFile, cacheDir, outFile] = process.argv.slice(2);
    if (!prsFile || !cacheDir) throw new Error('usage: backtest.js <prs.json from gh pr list> <cache dir> [out.json]');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cwd = process.cwd();
    const repo = process.env.GITHUB_REPOSITORY || 'lemoncloud-io/dou-app';
    const prs = JSON.parse(fs.readFileSync(prsFile, 'utf8'));
    const rows = [];
    for (const pr of prs) {
        const merge = pr.mergeCommit && pr.mergeCommit.oid;
        if (!merge) continue;
        const commits = cached(cacheDir, `commits-${pr.number}.json`, () => prCommits(repo, pr.number));
        const range = rangeOf(merge, cwd);
        const files = changedFiles({ base: range.base, head: range.head, cwd });
        const result = classify({
            pr: {
                labels: (pr.labels || []).map(l => l.name),
                draft: false,
                isFork: pr.isCrossRepository,
                baseRef: 'develop',
            },
            files,
            commits,
            signals: { visualRegression: 'missing' },
        });
        const row = {
            number: pr.number,
            title: pr.title,
            mergedAt: pr.mergedAt,
            eligible: result.eligible,
            classes: result.classes,
            blocks: result.blocks,
            failedProofs: result.proof ? result.proof.failed.map(p => `${p.path}: ${p.why}`) : [],
            fixFails: result.fix ? result.fix.fails : [],
            files: files.length,
        };
        if (result.eligible) {
            const prShas = new Set([...commits.map(c => c.sha), merge]);
            row.reverted = reverts({ prShas, title: pr.title, cwd });
            row.followUps = followUpFixes({ prShas, merge, mergedAt: pr.mergedAt, files: files.map(f => f.path), cwd });
        }
        rows.push(row);
        process.stderr.write(`#${pr.number} ${row.eligible ? `ELIGIBLE ${row.classes.join('+')}` : '-'}\n`);
    }
    const summary = {
        total: rows.length,
        eligible: rows.filter(r => r.eligible).length,
        byClass: rows
            .filter(r => r.eligible)
            .reduce((acc, r) => ((acc[r.classes.join('+')] = (acc[r.classes.join('+')] || 0) + 1), acc), {}),
        reverted: rows.filter(r => r.reverted && r.reverted.length).map(r => r.number),
        followedByFix: rows.filter(r => r.followUps && r.followUps.length).map(r => r.number),
    };
    const out = JSON.stringify({ summary, rows }, null, 2);
    if (outFile) fs.writeFileSync(outFile, out);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = { hunksOldSide, rangeOf, followUpFixes, reverts };
