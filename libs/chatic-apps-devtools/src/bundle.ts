import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { listFiles } from './files';

/**
 * `bundle`: packs a built page into the zip that is handed over — the build folder's contents at the
 * top of the archive (`index.html`, `.well-known/chatic-app.json`, `assets/…`) and nothing else.
 * Entries are sorted and dated 1980-01-01, so the same build always packs to the same bytes.
 */

export interface BundleOptions {
    root: string;
    /** The build folder, relative to `root` (or absolute); `dist` by default. */
    dist?: string;
    /** The archive to write, relative to `root` (or absolute); `<project folder>.zip` by default. */
    out?: string;
}

export interface BundleResult {
    /** The archive written, as an absolute path. */
    file: string;
    /** The paths inside it, in order. */
    entries: string[];
    bytes: number;
}

const REQUIRED = ['index.html', '.well-known/chatic-app.json'];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

/** 1980-01-01 00:00 in DOS time and date. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

/** A zip of `files` (path in the archive → contents), deflated. */
export const zip = (files: Array<{ name: string; data: Buffer }>): Buffer => {
    const locals: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const { name, data } of files) {
        const path = Buffer.from(name);
        const packed = deflateRawSync(data);
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(path.length, 26);
        locals.push(local, path, packed);
        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(20, 4);
        entry.writeUInt16LE(20, 6);
        entry.writeUInt16LE(0x0800, 8);
        entry.writeUInt16LE(8, 10);
        entry.writeUInt16LE(DOS_TIME, 12);
        entry.writeUInt16LE(DOS_DATE, 14);
        entry.writeUInt32LE(crc, 16);
        entry.writeUInt32LE(packed.length, 20);
        entry.writeUInt32LE(data.length, 24);
        entry.writeUInt16LE(path.length, 28);
        entry.writeUInt32LE(offset, 42);
        central.push(entry, path);
        offset += local.length + path.length + packed.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
};

/** Packs the build in `options.root`; throws when it is not built, or not a page's build. */
export const bundle = (options: BundleOptions): BundleResult => {
    const root = resolve(options.root);
    const distDir = resolve(root, options.dist ?? 'dist');
    const file = resolve(root, options.out ?? `${basename(root)}.zip`);
    if (!existsSync(distDir)) throw new Error(`No build at ${distDir}: build the page first.`);
    if (!relative(distDir, file).startsWith('..')) {
        throw new Error(`${file} is inside the build folder; write the zip outside ${distDir}.`);
    }
    const entries = listFiles(distDir);
    const missing = REQUIRED.filter(path => !entries.includes(path));
    if (missing.length) throw new Error(`${missing.join(' and ')} missing from ${distDir}: build the page first.`);
    for (const entry of entries) {
        if (lstatSync(join(distDir, entry)).isSymbolicLink()) {
            throw new Error(`${entry} is a link; the bundle holds files only.`);
        }
    }
    const archive = zip(entries.map(name => ({ name, data: readFileSync(join(distDir, name)) })));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, archive);
    return { file, entries, bytes: archive.length };
};
