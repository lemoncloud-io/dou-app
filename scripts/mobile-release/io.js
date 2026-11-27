const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function git(args, options = {}) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options }).trim();
}

function tryGit(args) {
    try {
        return git(args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return null;
    }
}

function gh(args, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(
            'gh',
            args,
            { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options },
            (error, stdout, stderr) => {
                if (error) reject(new Error(`gh ${args.join(' ')} failed: ${(stderr || error.message).trim()}`));
                else resolve(stdout);
            }
        );
    });
}

function repoSlug() {
    if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
    const url = tryGit(['remote', 'get-url', 'origin']) || '';
    const match = /github\.com[:/]([^/]+\/[^/.]+?)(\.git)?$/.exec(url);
    if (!match) throw new Error('Cannot tell the GitHub repository; set GITHUB_REPOSITORY=owner/name');
    return match[1];
}

function nxGraph() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-release-'));
    const file = path.join(dir, 'graph.json');
    try {
        execFileSync('npx', ['nx', 'graph', `--file=${file}`], {
            cwd: ROOT,
            stdio: ['ignore', 'ignore', 'inherit'],
            env: { NX_DAEMON: 'false', ...process.env },
        });
        return JSON.parse(fs.readFileSync(file, 'utf8')).graph;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await fn(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function runMain(entry, main) {
    if (require.main !== entry) return;
    Promise.resolve()
        .then(() => main(process.argv.slice(2)))
        .catch(error => {
            console.error(error.message);
            process.exit(1);
        });
}

module.exports = { runMain, ROOT, git, tryGit, gh, repoSlug, nxGraph, mapLimit };
