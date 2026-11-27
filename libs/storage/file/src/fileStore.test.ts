import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileStoragePorts, fileStore } from '.';

jest.mock('@chatic/logger', () => ({ logger: { warn: jest.fn() } }));

describe('fileStore', () => {
    let directory: string;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'chatic-file-store-'));
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it('keeps values across a new store on the same file', () => {
        const path = join(directory, 'nested', 'store.json');
        const first = fileStore(path);
        first.set('a', '1');
        first.set('b', '2');
        first.remove('b');

        const second = fileStore(path);
        expect(second.get('a')).toBe('1');
        expect(second.get('b')).toBeNull();
        expect(second.keys()).toEqual(['a']);
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ a: '1' });
    });

    it('writes the file readable by its owner only', () => {
        const path = join(directory, 'secret.json');
        fileStore(path).set('token', 'x');

        expect(statSync(path).mode & 0o777).toBe(0o600);
    });

    it('starts empty when the file is missing or unreadable', () => {
        expect(fileStore(join(directory, 'missing.json')).keys()).toEqual([]);

        const broken = join(directory, 'broken.json');
        writeFileSync(broken, '{not json');
        expect(fileStore(broken).keys()).toEqual([]);
    });

    it('clear empties the file', () => {
        const path = join(directory, 'store.json');
        const store = fileStore(path);
        store.set('a', '1');
        store.clear();

        expect(fileStore(path).keys()).toEqual([]);
    });

    it('gives each storage role its own file', () => {
        const ports = fileStoragePorts(directory);
        ports.secret.set('k', 'secret');
        ports.device.set('k', 'device');

        const again = fileStoragePorts(directory);
        expect(again.secret.get('k')).toBe('secret');
        expect(again.plain.get('k')).toBeNull();
        expect(again.device.get('k')).toBe('device');
    });
});
