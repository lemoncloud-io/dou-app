'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const { ROOT } = require('./files');

const BASELINE_FILE = path.join(ROOT, 'scripts/ratchet/knip-ratchet-baseline.json');
const ISSUE_TYPES = ['files', 'exports', 'types', 'duplicates'];

const fromReport = report => {
    const result = {};
    const add = (file, key) => {
        result[file] = result[file] || {};
        result[file][key] = 1;
    };
    for (const file of report.files || []) add(file, 'file');
    for (const issue of report.issues || []) {
        for (const item of issue.files || []) add(issue.file, `file${item.name ? `:${item.name}` : ''}`);
        for (const item of issue.exports || []) add(issue.file, `export:${item.name}`);
        for (const item of issue.types || []) add(issue.file, `type:${item.name}`);
        for (const group of issue.duplicates || []) {
            const names = group.map(item => item.name).sort();
            add(issue.file, `duplicate:${names.join('|')}`);
        }
    }
    return result;
};

const measure = () => {
    const bin = path.join(ROOT, 'node_modules/.bin/knip');
    const stdout = execFileSync(
        bin,
        ['--reporter', 'json', '--no-exit-code', '--no-progress', '--include', ISSUE_TYPES.join(',')],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return fromReport(JSON.parse(stdout));
};

module.exports = { BASELINE_FILE, fromReport, measure };
