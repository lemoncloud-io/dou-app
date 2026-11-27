#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SECONDS_FILE = path.join(ROOT, 'scripts/test-seconds.json');

const USAGE = `Usage:
  node scripts/test-shards.js --scope "<nx scope>" --index <i> --total <n>
  # prints the comma-separated test projects of shard i of n, longest first by scripts/test-seconds.json
  node scripts/test-shards.js --record <ci log of a run of every project>
  # rewrites scripts/test-seconds.json from each project's jest "Time:" or vitest "Duration" line`;

const parseArgs = argv => {
    if (argv[0] === '--record') {
        if (!argv[1]) throw new Error(USAGE);
        return { record: argv[1] };
    }
    const options = { scope: null, index: null, total: null };
    for (let i = 0; i < argv.length; i++) {
        const value = argv[i + 1];
        if (argv[i] === '--scope') options.scope = value;
        else if (argv[i] === '--index') options.index = Number(value);
        else if (argv[i] === '--total') options.total = Number(value);
        else throw new Error(`unknown argument ${argv[i]}\n${USAGE}`);
        i++;
    }
    if (!options.scope || !(options.total >= 1) || !(options.index >= 1 && options.index <= options.total)) {
        throw new Error(USAGE);
    }
    return options;
};

const planShards = (projects, total, seconds) => {
    const known = projects
        .map(project => seconds[project])
        .filter(value => value !== undefined)
        .sort((a, b) => a - b);
    const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
    const shards = Array.from({ length: total }, () => ({ projects: [], seconds: 0 }));
    const weighted = projects
        .map(project => ({ project, cost: seconds[project] ?? fallback }))
        .sort((a, b) => b.cost - a.cost || a.project.localeCompare(b.project));
    for (const { project, cost } of weighted) {
        const lightest = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best));
        lightest.projects.push(project);
        lightest.seconds += cost;
    }
    return shards;
};

const ANSI = new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, 'g');

const recordSeconds = log => {
    const seconds = {};
    let project = null;
    for (const raw of log.split('\n')) {
        const line = raw.replace(ANSI, '').replace(/^.*?Z /, '');
        const header = line.match(/nx run ([^\s:]+):test\b/);
        if (header) {
            project = header[1];
            continue;
        }
        if (!project) continue;
        const time = line.match(/^\s*(?:Time:\s+([\d.]+)\s*s|Duration\s+([\d.]+)s)/);
        if (time) {
            seconds[project] = Math.max(1, Math.round(Number(time[1] ?? time[2])));
            project = null;
        }
    }
    return Object.fromEntries(
        Object.keys(seconds)
            .sort()
            .map(key => [key, seconds[key]])
    );
};

const showArgs = scope => {
    const words = scope.trim().split(/\s+/);
    return words[0] === 'affected' ? ['--affected', ...words.slice(1)] : [];
};

const testProjects = scope => {
    const out = execFileSync('npx', ['nx', 'show', 'projects', ...showArgs(scope), '--with-target', 'test', '--json'], {
        cwd: ROOT,
        env: { ...process.env, NX_DAEMON: 'false' },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out.slice(out.indexOf('[')));
};

const main = () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.record) {
        const recorded = recordSeconds(fs.readFileSync(options.record, 'utf8'));
        const kept = JSON.parse(fs.readFileSync(SECONDS_FILE, 'utf8'));
        const next = Object.fromEntries(
            Object.keys({ ...kept, ...recorded })
                .sort()
                .map(key => [key, recorded[key] ?? kept[key]])
        );
        fs.writeFileSync(SECONDS_FILE, `${JSON.stringify(next, null, 4)}\n`);
        console.log(
            `recorded ${Object.keys(recorded).length} project(s); kept ${Object.keys(next).length - Object.keys(recorded).length} with no time in the log`
        );
        return;
    }
    const seconds = JSON.parse(fs.readFileSync(SECONDS_FILE, 'utf8'));
    const plan = planShards(testProjects(options.scope), options.total, seconds);
    console.log(plan[options.index - 1].projects.join(','));
};

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}

module.exports = { parseArgs, planShards, recordSeconds, showArgs };
