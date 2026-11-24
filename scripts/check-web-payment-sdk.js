#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, process.argv[2] ?? 'dist/apps/web');
const PATTERN = /js\.stripe\.com|cdn\.portone\.io|portone\/browser-sdk|PortOne/;
const STATIC_IMPORT = /\bimport\s*(?:[\w$*{}\s,]+from\s*)?["']([^"']+\.js)["']/g;

const html = path.join(DIST, 'index.html');
if (!fs.existsSync(html)) {
    console.error(`${path.relative(ROOT, html)} is missing: build the web app for production first (nx build web).`);
    process.exit(1);
}

const entries = [...fs.readFileSync(html, 'utf8').matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.js)"/g)].map(
    ([, src]) => path.join(DIST, src.replace(/^\//, ''))
);

const initial = new Set();
const visit = file => {
    if (initial.has(file) || !fs.existsSync(file)) return;
    initial.add(file);
    for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
        if (spec.startsWith('.') || spec.startsWith('/')) {
            visit(spec.startsWith('/') ? path.join(DIST, spec) : path.resolve(path.dirname(file), spec));
        }
    }
};
entries.forEach(visit);

if (initial.size === 0) {
    console.error(`${path.relative(ROOT, html)} names no script: nothing was checked.`);
    process.exit(1);
}

const carrying = [...initial].filter(file => PATTERN.test(fs.readFileSync(file, 'utf8')));
if (carrying.length > 0) {
    console.error(
        `${carrying.map(file => path.relative(ROOT, file)).join('\n')}\n` +
            'A payment provider SDK reached a chunk the web loads at start. The in-app checkout and its SDKs belong in ' +
            'their own lazy chunk (apps/web/docs/feature/subscription/README.md § 6).'
    );
    process.exit(1);
}
console.log(`${path.relative(ROOT, DIST)}: ${initial.size} initial chunk(s), no payment provider SDK.`);
