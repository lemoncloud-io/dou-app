import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { bundle } from './bundle';

/** The entries of a zip, read back from its central directory: name and contents. */
const readZip = (archive: Buffer) => {
    const end = archive.length - 22;
    const count = archive.readUInt16LE(end + 10);
    let at = archive.readUInt32LE(end + 16);
    const entries: Array<{ name: string; text: string; date: number }> = [];
    for (let i = 0; i < count; i++) {
        const packed = archive.readUInt32LE(at + 20);
        const nameLength = archive.readUInt16LE(at + 28);
        const local = archive.readUInt32LE(at + 42);
        const name = archive.subarray(at + 46, at + 46 + nameLength).toString();
        const start = local + 30 + archive.readUInt16LE(local + 26);
        entries.push({
            name,
            text: inflateRawSync(archive.subarray(start, start + packed)).toString(),
            date: archive.readUInt16LE(at + 14),
        });
        at += 46 + nameLength;
    }
    return entries;
};

const project = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), 'chatic-apps-bundle-'));
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), text);
    }
    return root;
};

describe('bundle', () => {
    it("packs the build folder's contents at the top of the zip, and nothing else", () => {
        const root = project({
            'dist/index.html': '<html></html>',
            'dist/.well-known/chatic-app.json': '{"manifestVersion":1}',
            'dist/assets/index.js': 'console.log(1)',
            'src/main.ts': 'not shipped',
        });
        try {
            const result = bundle({ root, out: 'page.zip' });
            expect(result.file).toBe(join(root, 'page.zip'));
            const entries = readZip(readFileSync(result.file));
            expect(entries.map(entry => entry.name)).toEqual([
                '.well-known/chatic-app.json',
                'assets/index.js',
                'index.html',
            ]);
            expect(entries.find(entry => entry.name === 'assets/index.js')?.text).toBe('console.log(1)');
            expect(new Set(entries.map(entry => entry.date))).toEqual(new Set([(1 << 5) | 1]));
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('packs the same build to the same bytes', () => {
        const root = project({ 'dist/index.html': 'x', 'dist/.well-known/chatic-app.json': '{}' });
        try {
            const first = readFileSync(bundle({ root, out: 'a.zip' }).file);
            const second = readFileSync(bundle({ root, out: 'b.zip' }).file);
            expect(first.equals(second)).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('refuses a folder that is not built, or not a page', () => {
        const empty = project({ 'src/main.ts': '' });
        const noManifest = project({ 'dist/index.html': 'x' });
        try {
            expect(() => bundle({ root: empty })).toThrow(/build the page first/);
            expect(() => bundle({ root: noManifest })).toThrow(/chatic-app\.json missing/);
        } finally {
            rmSync(empty, { recursive: true, force: true });
            rmSync(noManifest, { recursive: true, force: true });
        }
    });

    it('refuses to write the zip inside the build folder', () => {
        const root = project({ 'dist/index.html': 'x', 'dist/.well-known/chatic-app.json': '{}' });
        try {
            expect(() => bundle({ root, out: 'dist/page.zip' })).toThrow(/inside the build folder/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('refuses a link', () => {
        const root = project({ 'dist/index.html': 'x', 'dist/.well-known/chatic-app.json': '{}' });
        try {
            symlinkSync('/etc/hosts', join(root, 'dist/hosts'));
            expect(() => bundle({ root })).toThrow(/is a link/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
