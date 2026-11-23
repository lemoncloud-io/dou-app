'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { ROOT, listFiles } = require('./files');
const { SOURCE_PATTERNS } = require('./source');

const BASELINE_FILE = path.join(ROOT, 'scripts/ratchet/jscpd-ratchet-baseline.json');

const fromReport = report => {
    const lines = new Map();
    const mark = side => {
        const set = lines.get(side.name) || new Set();
        for (let line = side.start; line <= side.end; line++) set.add(line);
        lines.set(side.name, set);
    };
    for (const duplicate of report.duplicates || []) {
        mark(duplicate.firstFile);
        mark(duplicate.secondFile);
    }
    const result = {};
    for (const [file, set] of lines) result[file.split(path.sep).join('/')] = set.size;
    return result;
};

const measure = () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'jscpd-ratchet-'));
    try {
        const files = listFiles(SOURCE_PATTERNS);
        execFileSync(
            path.join(ROOT, 'node_modules/.bin/jscpd'),
            ['--silent', '--no-gitignore', '--reporters', 'json', '--output', output, ...files],
            { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
        );
        return fromReport(JSON.parse(fs.readFileSync(path.join(output, 'jscpd-report.json'), 'utf8')));
    } finally {
        fs.rmSync(output, { recursive: true, force: true });
    }
};

module.exports = { BASELINE_FILE, fromReport, measure };
