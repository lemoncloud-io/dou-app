#!/usr/bin/env node
/**
 * Fail on Korean prose in a tracked markdown file — enforcing AGENTS.md's "everything written into
 * the repo… is in English" for the one surface `yarn lint`/typecheck/test cannot see: a document is
 * not source, so nothing else in the gate reads one.
 *
 * The rule isn't "no Hangul." Citing the literal Korean value of a UI string next to its English
 * translation is normal and necessary technical writing — `channelList.selfChannel`: ko `나와의 채팅`,
 * en `My Chat` is documenting a real i18n key pair, not writing the document in Korean. So a citation
 * is exempt when it reads as one: inside a fenced code block, an inline `code span`, a "double-quoted
 * string" (the shape a UI-copy citation actually takes throughout this repo's ADRs), or a short
 * 'Korean word' cited in single quotes (for the rarer case of naming a grammar particle or term, not
 * quoting prose). Anything else — a bare Korean sentence, a heading, a bullet not wrapped in one of
 * those — is a real violation.
 *
 * `CHANGELOG.md` is permanently exempt, matching the ADR-0105 precedent: its entries are a record of
 * what a release said at the time, in whatever language the commit that produced them used, and
 * "fixing" one would falsify history rather than correct a live document.
 *
 * Each exempt span is blanked to spaces rather than deleted, so a match's reported line number always
 * matches the real file — a span is free to contain newlines (a wrapped quoted string, a multi-line
 * fenced block) without shifting anything after it.
 *
 * Usage:
 *   node scripts/check-doc-korean.js           # every tracked markdown file
 *   node scripts/check-doc-korean.js docs/adr  # only files under a path
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EXEMPT_FILES = new Set(['CHANGELOG.md']);

// Hangul syllables (가–힣) plus the compatibility jamo block (ㄱ–ㆎ) used for bare consonants/vowels.
const HANGUL_CHAR = '\\uac00-\\ud7a3\\u3131-\\u318e';
const HANGUL_LINE = new RegExp(`[${HANGUL_CHAR}]`);

const FENCE = /```[\s\S]*?```/g;
const CODE_SPAN = /`[^`]*`/g;
const DOUBLE_QUOTED = /"[^"\n]*"/g;
// Single quotes double as English contractions ("don't … that's"), so only a short Hangul span
// inside them is treated as a citation — a generic single-quote strip would swallow whatever sits
// between two unrelated apostrophes on the same line.
const SINGLE_QUOTED_KOREAN = new RegExp(`'[${HANGUL_CHAR}]{1,12}'`, 'g');

/** Replaces every matched span with same-shaped whitespace — newlines survive, everything else becomes a space. */
const blank = (text, pattern) => text.replace(pattern, match => match.replace(/[^\n]/g, ' '));

const trackedMarkdown = () =>
    execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

/** `source` is injectable so the tests can state a document instead of writing one to disk. */
const checkFile = (file, contents = fs.readFileSync(path.join(ROOT, file), 'utf8')) => {
    if (EXEMPT_FILES.has(file)) return [];

    let cleaned = blank(contents, FENCE);
    cleaned = blank(cleaned, CODE_SPAN);
    cleaned = blank(cleaned, DOUBLE_QUOTED);
    cleaned = blank(cleaned, SINGLE_QUOTED_KOREAN);

    const problems = [];
    cleaned.split('\n').forEach((line, i) => {
        if (HANGUL_LINE.test(line)) {
            problems.push(`Korean prose      line ${i + 1}: ${contents.split('\n')[i].trim().slice(0, 140)}`);
        }
    });
    return problems;
};

const run = scope => {
    const files = trackedMarkdown().filter(file => scope.length === 0 || scope.some(prefix => file.startsWith(prefix)));
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
            `\n${failures} line(s) of untranslated Korean in ${files.length} markdown files. Quote a UI ` +
                'string with "double quotes" or a `code span` if this is a literal citation, not prose.'
        );
        return 1;
    }
    console.log(`${files.length} markdown files checked, no untranslated Korean prose found.`);
    return 0;
};

if (require.main === module) {
    process.exit(run(process.argv.slice(2)));
}

module.exports = { checkFile, run };
