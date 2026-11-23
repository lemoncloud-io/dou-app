#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/package.json`);
const ts = require('typescript');

const base = process.argv[2] ?? 'origin/develop';
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const SOURCES = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs'];
const files = git(['diff', '--cached', '--name-only', '--diff-filter=M', base, '--', ...SOURCES])
    .split('\n')
    .filter(Boolean);
const unstaged = git(['diff', '--name-only', '--', ...SOURCES])
    .split('\n')
    .filter(Boolean);

const DIRECTIVES =
    /@ts-(?:expect-error|ignore|nocheck)|@vite-ignore|[#@]__PURE__|[#@]__NO_SIDE_EFFECTS__|\/\/\/\s*<reference|prettier-ignore|eslint-(?:disable|enable)|webpackChunkName|istanbul ignore|c8 ignore|@jsx/g;

const printer = ts.createPrinter({ removeComments: true });
const normalise = (name, text) => {
    const kind = name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return printer.printFile(ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, kind));
};
const directives = text => (text.match(DIRECTIVES) ?? []).sort().join('\n');

let failed = 0;
for (const file of unstaged) process.stdout.write(`UNSTAGED   ${file} (stage it, or it is not checked)\n`);
for (const file of files) {
    const before = git(['show', `${base}:${file}`]);
    const after = git(['show', `:${file}`]);
    let verdict = 'identical';
    if (normalise(file, before) !== normalise(file, after)) verdict = 'DIFFERENT';
    else if (directives(before) !== directives(after)) verdict = 'DIRECTIVE';
    if (verdict !== 'identical') failed += 1;
    process.stdout.write(`${verdict.padEnd(10)} ${file}\n`);
}
process.stdout.write(`${files.length} files, ${failed} not identical\n`);
process.exit(failed || unstaged.length ? 1 : 0);
