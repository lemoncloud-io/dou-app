#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = name => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
};
const base = flag('--base') ?? 'origin/develop';
const staleWeeks = flag('--stale');
const head = flag('--head');
const git = (...a) =>
    execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
const SOURCE_LINES = [
    ':(glob)apps/*/src/**',
    ':(glob)libs/*/src/**',
    ':(glob)apps/mobile/android/**',
    ':(glob)apps/mobile/ios/**',
    ':(glob)**/package.json',
    'yarn.lock',
];

export const changedLinesOf = diff =>
    diff
        .split('\n')
        .filter(line => /^\+(?!\+\+ )|^-(?!-- )/.test(line))
        .join('\n');

export const parseItems = text =>
    text
        .split(/^## /m)
        .slice(1)
        .map(block => {
            const [title, ...rest] = block.split('\n');
            const body = rest.join('\n');
            const field = name =>
                body.match(new RegExp(`^- ${name}: ([\\s\\S]*?)(?=^- \\w+:|$(?![\\s\\S]))`, 'm'))?.[1].trim();
            const list = value => [...(value ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]);
            return {
                title: title.trim(),
                paths: list(field('paths')),
                diff: list(field('diff'))[0],
                check: (field('check') ?? '').replace(/\s+/g, ' '),
                from: (field('from') ?? '').replace(/\s+/g, ' '),
            };
        });

export const globToRegExp = glob =>
    new RegExp(
        `^${glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*\/?/g, '<<GLOBSTAR>>')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')
            .replace(/<<GLOBSTAR>>/g, '.*')}$`
    );

export const fired = (items, files, changedLines) =>
    items.filter(
        item =>
            item.paths.some(glob => files.some(file => globToRegExp(glob).test(file))) ||
            (item.diff && new RegExp(item.diff).test(changedLines))
    );

const readChecklist = root => {
    try {
        return { text: git('show', `${base}:REVIEW.md`), source: `${base}:REVIEW.md` };
    } catch {
        process.stderr.write(
            `WARNING: REVIEW.md is not on ${base}; reading the working tree copy, which this change can edit.\n`
        );
        return { text: fs.readFileSync(`${root}/REVIEW.md`, 'utf8'), source: 'REVIEW.md (working tree)' };
    }
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    process.chdir(git('rev-parse', '--show-toplevel').trim());
    const { text, source } = readChecklist(process.cwd());
    const items = parseItems(text);
    if (staleWeeks) {
        const since = `${Number(staleWeeks) * 7} days ago`;
        for (const item of items) {
            const hits = git(
                'log',
                base,
                `--since=${since}`,
                '--format=%h',
                '--',
                ...item.paths.map(p => `:(glob)${p}`)
            )
                .split('\n')
                .filter(Boolean).length;
            if (hits === 0) process.stdout.write(`stale (${staleWeeks} weeks, 0 commits): ${item.title}\n`);
        }
        process.exit(0);
    }
    const from = git('merge-base', base, head ?? 'HEAD').trim();
    const range = head ? [from, head] : [from];
    const files = [
        ...git('diff', '--no-renames', '--name-only', ...range).split('\n'),
        ...(head ? [] : git('ls-files', '--others', '--exclude-standard').split('\n')),
    ].filter(Boolean);
    const changedLines = changedLinesOf(git('diff', '--no-renames', '--unified=0', ...range, '--', ...SOURCE_LINES));
    const matches = fired(items, files, changedLines);
    process.stdout.write(`${matches.length} of ${items.length} items fired (${source})\n\n`);
    for (const item of matches) process.stdout.write(`## ${item.title}\n${item.check}\nfrom: ${item.from}\n\n`);
}
