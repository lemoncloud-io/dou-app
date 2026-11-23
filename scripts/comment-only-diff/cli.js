#!/usr/bin/env node
const { proveCommentRemoval } = require('./ast');
const { changedFiles, mergeBase } = require('./git-input');

const SOURCE = /\.([cm]?[jt]s|[jt]sx)$/;

function parseArgs(argv) {
    const opts = { base: 'origin/develop', head: 'HEAD', json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--json') opts.json = true;
        else if (arg === '--base' || arg === '--head') opts[arg.slice(2)] = argv[++i];
        else throw new Error(`unexpected argument ${arg}`);
    }
    return opts;
}

function check({ base, head, cwd = process.cwd() }) {
    const from = mergeBase({ base, head, cwd });
    const files = changedFiles({ base: from, head, cwd }).map(file => {
        if (!SOURCE.test(file.path)) return { path: file.path, result: 'skipped', why: 'not a source file' };
        if (file.binary || file.status !== 'M') {
            return { path: file.path, result: 'failed', why: 'a source file was added, deleted or changed type' };
        }
        const proof = proveCommentRemoval(file.path, file.before(), file.after());
        return proof.ok
            ? { path: file.path, result: 'proven', removed: proof.removed }
            : { path: file.path, result: 'failed', why: proof.why };
    });
    const sources = files.filter(f => f.result !== 'skipped');
    const ok = sources.length > 0 && sources.every(f => f.result === 'proven');
    return { ok, base: from, head, files };
}

function format(report) {
    const lines = report.files.map(f =>
        f.result === 'proven'
            ? `proven   ${f.path} (${f.removed} removed)`
            : `${f.result.padEnd(8)} ${f.path}: ${f.why}`
    );
    const proven = report.files.filter(f => f.result === 'proven').length;
    lines.push(
        report.ok
            ? `\nComment-only: ${proven} source files changed, each by removing comments and nothing else.`
            : '\nNot comment-only: at least one source file changed code, gained a comment, or no source file changed.'
    );
    return lines.join('\n');
}

if (require.main === module) {
    try {
        const opts = parseArgs(process.argv.slice(2));
        const report = check(opts);
        process.stdout.write(`${opts.json ? JSON.stringify(report, null, 2) : format(report)}\n`);
        process.exit(report.ok ? 0 : 1);
    } catch (err) {
        process.stderr.write(`${err.message}\nusage: cli.js [--base origin/develop] [--head HEAD] [--json]\n`);
        process.exit(2);
    }
}

module.exports = { parseArgs, check, format };
