'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const { ROOT, listFiles } = require('./files');
const { countSource, compact } = require('../../tools/eslint-rules/ratchet-count');

const SOURCE_PATTERNS = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs'];
const BASELINE_FILE = path.join(ROOT, 'scripts/ratchet/source-ratchet-baseline.json');

const rootRequire = createRequire(path.join(ROOT, 'package.json'));

const parseFile = (relativePath, text) => {
    const { parse } = rootRequire('@typescript-eslint/typescript-estree');
    const jsx = /\.(tsx|jsx|js|mjs|cjs)$/.test(relativePath);
    const options = { comment: true, loc: true, range: true, jsx, filePath: relativePath };
    try {
        return parse(text, options);
    } catch (error) {
        if (!jsx) throw error;
        return parse(text, { ...options, jsx: false });
    }
};

const countFile = (relativePath, text) => {
    const { visitorKeys } = rootRequire('@typescript-eslint/visitor-keys');
    const ast = parseFile(relativePath, text);
    return countSource({ ast, comments: ast.comments, visitorKeys, relativePath }).counts;
};

const measure = (files = listFiles(SOURCE_PATTERNS)) => {
    const result = {};
    const failures = [];
    for (const file of files) {
        let counts;
        try {
            counts = countFile(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
        } catch (error) {
            failures.push({ file, message: error.message });
            continue;
        }
        const entry = compact(counts);
        if (Object.keys(entry).length) result[file] = entry;
    }
    return { result, failures };
};

module.exports = { BASELINE_FILE, SOURCE_PATTERNS, countFile, measure };
