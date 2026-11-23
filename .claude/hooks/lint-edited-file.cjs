#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { readInput, modeOf, record } = require('./lib.cjs');

const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const CONFIGS = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', 'eslint.config.ts'];

const configDirFor = (file, root) => {
    for (let dir = path.dirname(file); dir.startsWith(root); dir = path.dirname(dir)) {
        if (CONFIGS.some(name => fs.existsSync(path.join(dir, name)))) return dir;
        if (dir === root) break;
    }
    return root;
};

const eslintBin = root => {
    const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
        encoding: 'utf8',
    });
    const candidates = [root];
    if (common.status === 0) candidates.push(path.dirname(common.stdout.trim()));
    return candidates.map(dir => path.join(dir, 'node_modules', '.bin', 'eslint')).find(bin => fs.existsSync(bin));
};

const lint = (input, root) => {
    const file = input?.tool_input?.file_path;
    if (!file || !LINTED.test(file) || !file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) return null;
    if (file.includes(`${path.sep}node_modules${path.sep}`)) return null;
    const eslint = eslintBin(root);
    if (!eslint) return null;
    const result = spawnSync(eslint, ['--no-warn-ignored', '--format', 'stylish', file], {
        cwd: configDirFor(file, root),
        encoding: 'utf8',
        timeout: 80_000,
    });
    if (result.status !== 1) return null;
    return `ESLint found problems in ${path.relative(root, file)}. Fix them before moving on:\n${result.stdout.trim()}`;
};

if (require.main === module) {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const input = readInput();
    const mode = modeOf('lint-edited-file');
    const message = mode === 'off' ? null : lint(input, root);
    if (message && mode === 'observe') {
        record('lint-edited-file', { session: input.session_id, outcome: 'would-block', file: input.tool_input?.file_path });
        process.stdout.write(
            `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } })}\n`
        );
    } else if (message) {
        process.stderr.write(`${message}\n`);
        process.exit(2);
    }
}

module.exports = { configDirFor, eslintBin, lint };
