#!/usr/bin/env node
/**
 * Fail on Korean prose in a source code comment — the code-comment half of AGENTS.md's English
 * policy that scripts/check-doc-korean.js already gates for markdown. The repo-wide comment
 * translation sweep is done; this closes the "not gated yet" gap AGENTS.md used to note.
 *
 * Scans line (`//`) and block (`/* ... *\/`) comments in TS/TSX/JS/JSX/Kotlin/Swift/Objective-C
 * source. It walks each file once, tracking whether the current character is inside a comment, a
 * string, or plain code — a naive line-based `//` search would misfire on a URL like
 * `"http://…"` or a `/* *\/` example quoted inside a string literal. Code outside comments, and any
 * string literal (Korean UI copy, describe()/it() names, mock data, locale tables), is never
 * inspected: this gate is comments-only, exactly like the rule it enforces.
 *
 * Same citation exemption as check-doc-korean.js: a Korean UI string cited inside a comment —
 * `` `나와의 채팅` `` or `"두유 홈"` — is data, not prose, and stays as-is.
 *
 * Usage:
 *   node scripts/check-code-korean.js              # every tracked source file
 *   node scripts/check-code-korean.js libs/app-runtime
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EXTENSIONS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.kt', '*.swift', '*.m', '*.mm'];
const EXCLUDED_PATH_SEGMENTS = ['/dist/', '/out-tsc/', '/node_modules/', '/.next/'];

// Hangul syllables (`가`–`힣`) plus the compatibility jamo block (`ㄱ`–`ㆎ`) used for bare consonants/vowels.
const HANGUL_CHAR = '\\uac00-\\ud7a3\\u3131-\\u318e';
const HANGUL_LINE = new RegExp(`[${HANGUL_CHAR}]`);

// Unlike DOUBLE_QUOTED below, this allows a newline inside the span — a JSDoc citation can wrap.
const CODE_SPAN = /`[^`]*`/g;
const DOUBLE_QUOTED = /"[^"\n]*"/g;
// Single quotes double as apostrophes in English comment prose, so only a short Hangul span inside
// them is treated as a citation — see check-doc-korean.js for the same reasoning.
const SINGLE_QUOTED_KOREAN = new RegExp(`'[${HANGUL_CHAR}]{1,12}'`, 'g');

/** Replaces every matched span with same-shaped whitespace — newlines survive, everything else becomes a space. */
const blank = (text, pattern) => text.replace(pattern, match => match.replace(/[^\n]/g, ' '));

/**
 * Walks `text` once, returning every `//` and `/* *\/` comment span as {start, end} character
 * offsets. String literals (single, double, and backtick/template) are tracked so a `/` inside one
 * — a URL, a quoted code example — is never mistaken for a comment opener. Regex literals are not
 * specially handled: telling `/foo/` apart from division needs a real parser, and a stray `//`
 * inside one is not a pattern this codebase's Korean comments ever take.
 */
const findComments = text => {
    const spans = [];
    const n = text.length;
    let i = 0;
    let state = 'code'; // 'code' | 'line' | 'block' | 'string'
    let stringChar = null;
    let start = null;

    while (i < n) {
        const c = text[i];
        if (state === 'code') {
            if (c === '/' && text[i + 1] === '/') {
                state = 'line';
                start = i;
                i += 2;
                continue;
            }
            if (c === '/' && text[i + 1] === '*') {
                state = 'block';
                start = i;
                i += 2;
                continue;
            }
            if (c === '"' || c === "'" || c === '`') {
                state = 'string';
                stringChar = c;
                i += 1;
                continue;
            }
            i += 1;
            continue;
        }
        if (state === 'line') {
            if (c === '\n') {
                spans.push({ start, end: i });
                state = 'code';
            }
            i += 1;
            continue;
        }
        if (state === 'block') {
            if (c === '*' && text[i + 1] === '/') {
                spans.push({ start, end: i + 2 });
                state = 'code';
                i += 2;
                continue;
            }
            i += 1;
            continue;
        }
        // state === 'string'
        if (c === '\\') {
            i += 2;
            continue;
        }
        if (c === stringChar) {
            state = 'code';
            i += 1;
            continue;
        }
        i += 1;
    }
    if (state === 'line' || state === 'block') spans.push({ start, end: n });
    return spans;
};

/** `source` is injectable so the tests can state a snippet instead of writing a file to disk. */
const checkFile = (file, contents = fs.readFileSync(path.join(ROOT, file), 'utf8')) => {
    const spans = findComments(contents);
    if (spans.length === 0) return [];

    // A copy of the file where only comment text can trip the Hangul check: everything outside a
    // comment span is blanked, and within each comment, quoted citations are blanked the same way
    // check-doc-korean.js exempts them. Blanking (not deleting) keeps every line number exact.
    let masked = contents.replace(/[^\n]/g, ' ');
    for (const { start, end } of spans) {
        let commentText = contents.slice(start, end);
        commentText = blank(commentText, CODE_SPAN);
        commentText = blank(commentText, DOUBLE_QUOTED);
        commentText = blank(commentText, SINGLE_QUOTED_KOREAN);
        masked = masked.slice(0, start) + commentText + masked.slice(end);
    }

    const problems = [];
    const originalLines = contents.split('\n');
    masked.split('\n').forEach((line, i) => {
        if (HANGUL_LINE.test(line)) {
            problems.push(`Korean comment    line ${i + 1}: ${originalLines[i].trim().slice(0, 140)}`);
        }
    });
    return problems;
};

const trackedSourceFiles = () =>
    execFileSync('git', ['ls-files', ...EXTENSIONS], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .filter(file => !EXCLUDED_PATH_SEGMENTS.some(segment => `/${file}`.includes(segment)));

const run = scope => {
    const files = trackedSourceFiles().filter(
        file => scope.length === 0 || scope.some(prefix => file.startsWith(prefix))
    );
    let failures = 0;
    for (const file of files) {
        const problems = checkFile(file);
        if (problems.length === 0) continue;
        failures += problems.length;
        console.error(`\n${file}`);
        for (const problem of problems) console.error(`  ${problem}`);
    }
    if (failures > 0) {
        console.error(
            `\n${failures} line(s) of untranslated Korean in ${files.length} source files. Quote a UI ` +
                'string with "double quotes" or a `code span` if this is a literal citation, not prose.'
        );
        return 1;
    }
    console.log(`${files.length} source files checked, no untranslated Korean comments found.`);
    return 0;
};

if (require.main === module) {
    process.exit(run(process.argv.slice(2)));
}

module.exports = { checkFile, findComments, run };
