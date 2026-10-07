#!/usr/bin/env node
/**
 * Fail on a tracked file that points into an internal document store — AGENTS.md's "Public surface"
 * rule, for the one reference shape that kept slipping in: a session-notes path in a comment or a
 * doc. A reader of this public repo cannot open it, and the path itself discloses internal structure.
 *
 * Matches `.claude/` followed by an 8-digit date folder, and `DEBUG-HH-MM-SS` note names. The pattern
 * is written so this file's own source does not match it.
 *
 * Usage:
 *   node scripts/check-internal-paths.js
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PATTERN = '\\.claude/[0-9]{8}|DEBUG-[0-9]{2}-[0-9]{2}-[0-9]{2}';
const SCOPE = ['apps', 'libs', 'scripts', 'docs'];

const { status, stdout } = spawnSync('git', ['grep', '-nE', PATTERN, '--', ...SCOPE], { cwd: ROOT, encoding: 'utf8' });

// `git grep` exits 1 for "no match"; anything else (a match, or git failing to run) must not pass.
if (status !== 1) {
    console.error(
        status === 0
            ? `${stdout}\nInternal path reference(s) above. Write the reasoning into the repo instead.`
            : `git grep did not run cleanly (exit ${status}).`
    );
    process.exit(1);
}
console.log(`No internal path references under ${SCOPE.join(', ')}.`);
