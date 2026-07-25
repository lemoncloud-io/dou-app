import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isUsableBundleRoot, persistRoot, readPersistedRoot } from './customUiState';

let dir: string;
let stateFile: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'custom-ui-state-'));
    stateFile = join(dir, 'chatic-custom-ui.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('readPersistedRoot', () => {
    it('returns null on first run, when no state has been written', () => {
        expect(readPersistedRoot(stateFile)).toBeNull();
    });

    it('round-trips a persisted root', () => {
        persistRoot(stateFile, '/tmp/custom-web/webroot/abc123');
        expect(readPersistedRoot(stateFile)).toBe('/tmp/custom-web/webroot/abc123');
    });

    it('returns null for a corrupt or half-written state file', () => {
        // A crash mid-write must not brick the next launch.
        writeFileSync(stateFile, '{"root": "/tmp/cus', 'utf8');
        expect(readPersistedRoot(stateFile)).toBeNull();
    });

    it('returns null when the stored root is missing, empty, or not a string', () => {
        for (const payload of ['{}', '{"root": ""}', '{"root": 42}', '{"root": null}', 'null']) {
            writeFileSync(stateFile, payload, 'utf8');
            expect(readPersistedRoot(stateFile)).toBeNull();
        }
    });
});

describe('persistRoot', () => {
    it('clears the state when given null, so the next launch starts on the remote web', () => {
        persistRoot(stateFile, '/tmp/custom-web/webroot/abc123');
        persistRoot(stateFile, null);
        expect(readPersistedRoot(stateFile)).toBeNull();
    });

    it('clearing an already-absent state is not an error', () => {
        expect(() => persistRoot(stateFile, null)).not.toThrow();
    });
});

describe('isUsableBundleRoot', () => {
    it('accepts a root holding an index.html', () => {
        const root = join(dir, 'webroot', 'abc123');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'index.html'), '<!doctype html>', 'utf8');
        expect(isUsableBundleRoot(root)).toBe(true);
    });

    it('rejects a root left behind without an index.html', () => {
        // An extraction killed halfway leaves the directory but not necessarily the entry
        // point; restoring it would load a blank window with no way back.
        const root = join(dir, 'webroot', 'half');
        mkdirSync(root, { recursive: true });
        expect(isUsableBundleRoot(root)).toBe(false);
    });

    it('rejects a root that no longer exists', () => {
        expect(isUsableBundleRoot(join(dir, 'webroot', 'gone'))).toBe(false);
    });
});
