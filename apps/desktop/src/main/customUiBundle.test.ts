import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userData = mkdtempSync(join(tmpdir(), 'custom-ui-bundle-'));

jest.mock('electron', () => ({ app: { getPath: (): string => userData } }));
jest.mock('./customUiProtocol', () => ({
    registerCustomUiProtocol: jest.fn(),
    unregisterCustomUiProtocol: jest.fn(),
}));

import { bundleRootFor } from './customUi';
import {
    applyCustomUi,
    disableCustomUi,
    getActiveCustomUiRoot,
    restoreCustomUi,
    serveCustomUi,
} from './customUiBundle';
import { initWebUrl, isCustomUiActive } from './webUrl';

const REMOTE = 'https://desktop.chatic.io';
const BASE = join(userData, 'custom-web');
const URL_A = 'https://cdn.example.com/a.zip';
const URL_B = 'https://cdn.example.com/b.zip';

const crc32 = (buf: Buffer): number => {
    let crc = ~0;
    for (const byte of buf) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ~crc >>> 0;
};

interface ZipEntry {
    name: string;
    body: string;
    unixMode?: number;
}

const buildZip = (entries: ZipEntry[]): Buffer => {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const { name, body, unixMode = 0o100644 } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const data = Buffer.from(body, 'utf8');
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        locals.push(local, nameBuf, data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE((3 << 8) | 20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE((unixMode << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuf);

        offset += local.length + nameBuf.length + data.length;
    }

    const centralDir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDir, end]);
};

const zipOf = (files: Record<string, string>): Buffer =>
    buildZip(Object.entries(files).map(([name, body]) => ({ name, body })));

const serve = (bodies: Record<string, Buffer | { status: number } | 'redirect'>): void => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const answer = bodies[String(input)];
        if (answer === undefined) throw new Error(`unexpected fetch: ${String(input)}`);
        if (answer === 'redirect') return new Response(null, { status: 302 });
        if (!Buffer.isBuffer(answer)) return new Response(null, { status: answer.status });
        return new Response(new Uint8Array(answer), { status: 200 });
    }) as typeof fetch;
};

beforeEach(() => {
    initWebUrl(REMOTE);
    rmSync(BASE, { recursive: true, force: true });
    rmSync(join(userData, 'chatic-custom-ui.json'), { force: true });
    disableCustomUi();
});

afterAll(() => rmSync(userData, { recursive: true, force: true }));

describe('applyCustomUi', () => {
    it('serves and persists a bundle carrying an index.html', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': '<h1>a</h1>', 'assets/app.js': 'a' }) });
        await applyCustomUi(URL_A);

        expect(isCustomUiActive()).toBe(true);
        expect(getActiveCustomUiRoot()).toBe(bundleRootFor(BASE, URL_A));
        expect(existsSync(join(bundleRootFor(BASE, URL_A), 'assets', 'app.js'))).toBe(true);
        expect(JSON.parse(readFileSync(join(userData, 'chatic-custom-ui.json'), 'utf8'))).toEqual({
            root: bundleRootFor(BASE, URL_A),
        });
    });

    it('refuses a non-https URL without reaching the network', async () => {
        serve({});
        await expect(applyCustomUi('http://cdn.example.com/a.zip')).rejects.toThrow('must be https');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refuses a redirect, so the https floor cannot be walked around', async () => {
        serve({ [URL_A]: 'redirect' });
        await expect(applyCustomUi(URL_A)).rejects.toThrow('must not redirect');
    });

    it('rejects an archive whose index.html is missing, leaving nothing behind', async () => {
        serve({ [URL_A]: zipOf({ 'nested/index.html': '<h1>a</h1>' }) });
        await expect(applyCustomUi(URL_A)).rejects.toThrow('index.html not found');
        expect(existsSync(`${bundleRootFor(BASE, URL_A)}.incoming`)).toBe(false);
        expect(isCustomUiActive()).toBe(false);
    });

    it('rejects a symlink entry before it can be created', async () => {
        serve({
            [URL_A]: buildZip([
                { name: 'index.html', body: '<h1>a</h1>' },
                { name: 'escape', body: '/', unixMode: 0o120777 },
            ]),
        });

        await expect(applyCustomUi(URL_A)).rejects.toThrow('symlink entry rejected');
        expect(existsSync(`${bundleRootFor(BASE, URL_A)}.incoming`)).toBe(false);
        expect(isCustomUiActive()).toBe(false);
    });

    it('keeps serving the previous bundle when a later apply fails', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': '<h1>a</h1>' }), [URL_B]: { status: 503 } });
        await applyCustomUi(URL_A);

        await expect(applyCustomUi(URL_B)).rejects.toThrow('HTTP 503');
        expect(isCustomUiActive()).toBe(true);
        expect(getActiveCustomUiRoot()).toBe(bundleRootFor(BASE, URL_A));
        expect(existsSync(join(bundleRootFor(BASE, URL_A), 'index.html'))).toBe(true);
    });

    it('does not leave the served root half-replaced when the SAME url is re-applied and fails', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': '<h1>a</h1>', 'keep.txt': 'keep' }) });
        await applyCustomUi(URL_A);

        serve({ [URL_A]: zipOf({ 'nested/index.html': '<h1>bad</h1>' }) });
        await expect(applyCustomUi(URL_A)).rejects.toThrow('index.html not found');

        expect(readFileSync(join(bundleRootFor(BASE, URL_A), 'keep.txt'), 'utf8')).toBe('keep');
        expect(isCustomUiActive()).toBe(true);
    });

    it('serializes overlapping applies rather than interleaving their staging dirs', async () => {
        serve({
            [URL_A]: zipOf({ 'index.html': '<h1>a</h1>', 'who.txt': 'a' }),
            [URL_B]: zipOf({ 'index.html': '<h1>b</h1>', 'who.txt': 'b' }),
        });
        const [first, second] = [applyCustomUi(URL_A), applyCustomUi(URL_B)];
        await Promise.all([first, second]);

        expect(getActiveCustomUiRoot()).toBe(bundleRootFor(BASE, URL_B));
        expect(readFileSync(join(bundleRootFor(BASE, URL_B), 'who.txt'), 'utf8')).toBe('b');
    });

    it('does not strand later applies when an earlier one rejects', async () => {
        serve({ [URL_A]: { status: 500 }, [URL_B]: zipOf({ 'index.html': '<h1>b</h1>' }) });
        const failing = applyCustomUi(URL_A);
        const following = applyCustomUi(URL_B);

        await expect(failing).rejects.toThrow('HTTP 500');
        await expect(following).resolves.toBeUndefined();
        expect(getActiveCustomUiRoot()).toBe(bundleRootFor(BASE, URL_B));
    });

    it('puts the previous bundle back when the swap itself fails', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': '<h1>a</h1>', 'who.txt': 'a' }) });
        await applyCustomUi(URL_A);

        const root = bundleRootFor(BASE, URL_A);
        const fsp = jest.requireActual<typeof FsPromises>('node:fs/promises');
        const realRename = fsp.rename;
        const rename = jest.spyOn(fsp, 'rename');
        rename.mockImplementationOnce(realRename).mockImplementationOnce(() => Promise.reject(new Error('EPERM')));

        serve({ [URL_A]: zipOf({ 'index.html': '<h1>b</h1>', 'who.txt': 'b' }) });
        await expect(applyCustomUi(URL_A)).rejects.toThrow('EPERM');
        rename.mockRestore();

        expect(readFileSync(join(root, 'who.txt'), 'utf8')).toBe('a');
        expect(isCustomUiActive()).toBe(true);
        expect(getActiveCustomUiRoot()).toBe(root);
    });

    it('prunes the roots of bundles no longer served', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': 'a' }), [URL_B]: zipOf({ 'index.html': 'b' }) });
        await applyCustomUi(URL_A);
        await applyCustomUi(URL_B);

        expect(existsSync(bundleRootFor(BASE, URL_A))).toBe(false);
        expect(existsSync(bundleRootFor(BASE, URL_B))).toBe(true);
    });
});

describe('restoreCustomUi', () => {
    it('re-serves the recorded bundle', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': '<h1>a</h1>' }) });
        await applyCustomUi(URL_A);
        disableCustomUi();
        writeFileSync(join(userData, 'chatic-custom-ui.json'), JSON.stringify({ root: bundleRootFor(BASE, URL_A) }));

        expect(restoreCustomUi()).toBe(true);
        expect(isCustomUiActive()).toBe(true);
    });

    it('clears a record whose root lost its entry point, rather than restoring it every launch', () => {
        const root = bundleRootFor(BASE, URL_A);
        mkdirSync(root, { recursive: true });
        writeFileSync(join(userData, 'chatic-custom-ui.json'), JSON.stringify({ root }));

        expect(restoreCustomUi()).toBe(false);
        expect(isCustomUiActive()).toBe(false);
        expect(existsSync(join(userData, 'chatic-custom-ui.json'))).toBe(false);
    });

    it('refuses a recorded root outside our own webroot', () => {
        const outside = join(userData, 'elsewhere');
        mkdirSync(outside, { recursive: true });
        writeFileSync(join(outside, 'index.html'), '<h1>x</h1>');
        writeFileSync(join(userData, 'chatic-custom-ui.json'), JSON.stringify({ root: outside }));

        expect(restoreCustomUi()).toBe(false);
        expect(isCustomUiActive()).toBe(false);
    });
});

describe('disableCustomUi', () => {
    it('stops serving and forgets the record it was serving from', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': '<h1>a</h1>' }) });
        await applyCustomUi(URL_A);

        disableCustomUi();

        expect(isCustomUiActive()).toBe(false);
        expect(getActiveCustomUiRoot()).toBeNull();
        expect(existsSync(join(userData, 'chatic-custom-ui.json'))).toBe(false);
    });

    it('keeps a record it was not serving, so a dev override cannot cost the applied bundle', async () => {
        serve({ [URL_A]: zipOf({ 'index.html': '<h1>a</h1>' }) });
        await applyCustomUi(URL_A);
        const record = readFileSync(join(userData, 'chatic-custom-ui.json'), 'utf8');

        const override = join(userData, 'override');
        mkdirSync(override, { recursive: true });
        writeFileSync(join(override, 'index.html'), '<h1>o</h1>');
        serveCustomUi(override);

        disableCustomUi();

        expect(isCustomUiActive()).toBe(false);
        expect(readFileSync(join(userData, 'chatic-custom-ui.json'), 'utf8')).toBe(record);
    });
});
