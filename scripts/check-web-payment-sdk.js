#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, process.argv[2] ?? 'dist/apps/web');
const PATTERN = /js\.stripe\.com|cdn\.portone\.io|portone\/browser-sdk|PortOne/;

const filesOf = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return filesOf(full);
        return /\.(js|mjs|html|css)$/.test(entry.name) ? [full] : [];
    });

if (!fs.existsSync(DIST)) {
    console.error(`${path.relative(ROOT, DIST)} is missing: build the web app for production first (nx build web).`);
    process.exit(1);
}

const carrying = filesOf(DIST).filter(file => PATTERN.test(fs.readFileSync(file, 'utf8')));
if (carrying.length > 0) {
    console.error(
        `${carrying.map(file => path.relative(ROOT, file)).join('\n')}\n` +
            'A payment provider SDK reached the web build. The shell checkout screen and its SDKs load only in a dev or local build ' +
            '(apps/web/docs/feature/subscription/README.md § 6).'
    );
    process.exit(1);
}
console.log(`${path.relative(ROOT, DIST)}: no payment provider SDK.`);
