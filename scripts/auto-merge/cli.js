#!/usr/bin/env node
const fs = require('node:fs');
const { classify } = require('./classify');
const { render } = require('./comment');
const { changedFiles, commitsBetween, mergeBase } = require('./git-input');

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const opts = {};
    for (let i = 0; i < rest.length; i += 2) {
        if (!rest[i].startsWith('--')) throw new Error(`unexpected argument ${rest[i]}`);
        opts[rest[i].slice(2)] = rest[i + 1];
    }
    return { command, opts };
}

function prFromView(view) {
    return {
        labels: (view.labels || []).map(l => l.name),
        draft: Boolean(view.isDraft),
        isFork: Boolean(view.isCrossRepository),
        baseRef: view.baseRefName,
    };
}

function runClassify(opts, cwd = process.cwd()) {
    const base = mergeBase({ base: opts.base, head: opts.head, cwd });
    const view = opts.pr ? JSON.parse(fs.readFileSync(opts.pr, 'utf8')) : {};
    const result = classify({
        pr: prFromView(view),
        files: changedFiles({ base, head: opts.head, cwd }),
        commits: commitsBetween({ base, head: opts.head, cwd }),
        signals: { visualRegression: opts.visual || 'missing' },
    });
    return { head: opts.head, base, ...result };
}

function main(argv) {
    const { command, opts } = parseArgs(argv);
    if (command === 'classify') {
        const result = runClassify(opts);
        const json = JSON.stringify(result, null, 2);
        if (opts.out) fs.writeFileSync(opts.out, json);
        process.stdout.write(`${result.eligible ? `eligible ${result.classes.join('+')}` : 'not eligible'}\n`);
        return;
    }
    if (command === 'comment') {
        const result = JSON.parse(fs.readFileSync(opts.result, 'utf8'));
        process.stdout.write(render(result, { headSha: result.head, action: opts.action, runUrl: opts['run-url'] }));
        return;
    }
    throw new Error(
        'usage: cli.js classify --base <ref> --head <sha> [--pr view.json] [--visual state] [--out result.json]\n       cli.js comment --result result.json --action <action> [--run-url url]'
    );
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (err) {
        process.stderr.write(`${err.message}\n`);
        process.exit(2);
    }
}

module.exports = { parseArgs, prFromView, runClassify };
