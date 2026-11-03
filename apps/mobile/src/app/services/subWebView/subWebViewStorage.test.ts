import { memoryStorageFile as memoryFile } from './memoryStorageFile';
import { SUB_WEBVIEW_STORAGE_LIMIT, SubWebViewStorage, subWebViewStorageId } from './subWebViewStorage';

describe('subWebViewStorageId', () => {
    it('gives each origin a file of its own, the same every time', () => {
        const quiz = subWebViewStorageId('https://quiz.apps.chatic.io');

        expect(quiz).toMatch(/^subwebview\.[0-9a-f]{32}$/);
        expect(subWebViewStorageId('https://quiz.apps.chatic.io')).toBe(quiz);
        expect(subWebViewStorageId('https://game.apps.chatic.io')).not.toBe(quiz);
        expect(subWebViewStorageId('https://quiz.apps-dev.chatic.io')).not.toBe(quiz);
    });

    // Changing the id would leave every page's data behind under the old name. The value is the
    // first 32 hex characters of the origin's SHA-256, as Node's crypto computes it too.
    it('never changes for an origin', () => {
        expect(subWebViewStorageId('https://sample.apps-dev.chatic.io')).toMatchInlineSnapshot(
            `"subwebview.3063f4a0ad5c8850cbed57a3de299a18"`
        );
    });
});

describe('SubWebViewStorage', () => {
    it('keeps JSON values and reads them back, leaving out keys with nothing stored', () => {
        const storage = new SubWebViewStorage(memoryFile());

        expect(storage.set({ level: 3, progress: { score: 12, tags: ['a'] }, none: null })).toEqual({
            ok: true,
            value: expect.objectContaining({ limit: SUB_WEBVIEW_STORAGE_LIMIT }),
        });

        expect(storage.get(['level', 'progress', 'none', 'missing'])).toEqual({
            ok: true,
            value: { entries: { level: 3, progress: { score: 12, tags: ['a'] }, none: null } },
        });
    });

    it('counts usage as the characters of keys and serialized values', () => {
        const storage = new SubWebViewStorage(memoryFile());

        storage.set({ ab: 'xyz' }); // 2 + '"xyz"'.length (5)
        expect(storage.info()).toEqual({
            ok: true,
            value: { keys: ['ab'], used: 7, limit: SUB_WEBVIEW_STORAGE_LIMIT },
        });

        storage.set({ ab: 1 }); // replaces: 2 + 1
        expect(storage.info()).toEqual(expect.objectContaining({ value: expect.objectContaining({ used: 3 }) }));
    });

    it('counts what was already in the file when it opens', () => {
        const file = memoryFile();
        file.set('kept', '"value"');

        expect(new SubWebViewStorage(file).info()).toEqual(
            expect.objectContaining({ value: expect.objectContaining({ used: 4 + 7 }) })
        );
    });

    it('refuses a write past the limit, and changes nothing', () => {
        const file = memoryFile();
        const storage = new SubWebViewStorage(file);
        storage.set({ a: 'x'.repeat(SUB_WEBVIEW_STORAGE_LIMIT / 2) });

        const result = storage.set({ b: 'y'.repeat(SUB_WEBVIEW_STORAGE_LIMIT / 2), c: 1 });

        expect(result).toEqual({ ok: false, code: 'QUOTA_EXCEEDED' });
        expect(file.getAllKeys()).toEqual(['a']);
    });

    it.each([
        ['an empty key', { '': 1 }],
        ['a key over 200 characters', { ['k'.repeat(201)]: 1 }],
        ['a value that is not JSON', { a: BigInt(1) }],
        ['an array for entries', [1]],
        ['the key __proto__', JSON.parse('{"__proto__": 1}')],
    ])('refuses %s, and writes none of the entries', (_label, entries) => {
        const file = memoryFile();
        const storage = new SubWebViewStorage(file);

        expect(storage.set(entries)).toEqual({ ok: false, code: 'INVALID' });
        expect(file.getAllKeys()).toEqual([]);
    });

    it('removes keys, and ignores a key with nothing stored', () => {
        const file = memoryFile();
        const storage = new SubWebViewStorage(file);
        storage.set({ a: 1, b: 2 });

        expect(storage.remove(['a', 'missing'])).toEqual({
            ok: true,
            value: { used: 2, limit: SUB_WEBVIEW_STORAGE_LIMIT },
        });
        expect(file.getAllKeys()).toEqual(['b']);
        // A trim drops MMKV's memory cache; a page removing a key at a time must not pay for it.
        expect(file.trims).toBe(0);
    });

    it('clears everything, and gives the space back', () => {
        const file = memoryFile();
        const storage = new SubWebViewStorage(file);
        storage.set({ a: 1 });

        storage.clear();

        expect(file.trims).toBe(1);

        expect(storage.info()).toEqual({ ok: true, value: { keys: [], used: 0, limit: SUB_WEBVIEW_STORAGE_LIMIT } });
    });

    it('counts afresh after the device refuses a write part way', () => {
        const file = memoryFile();
        const storage = new SubWebViewStorage(file);
        const write = file.set;
        file.set = (key, value) => {
            if (key === 'b') throw new Error('disk full');
            write(key, value);
        };

        expect(() => storage.set({ a: 1, b: 2 })).toThrow('disk full');
        file.set = write;

        expect(storage.info()).toEqual(expect.objectContaining({ value: expect.objectContaining({ used: 2 }) }));
    });

    it.each([[undefined], ['a'], [[1]], [['__proto__']]])('refuses %j as the keys to read or remove', keys => {
        const storage = new SubWebViewStorage(memoryFile());

        expect(storage.get(keys)).toEqual({ ok: false, code: 'INVALID' });
        expect(storage.remove(keys)).toEqual({ ok: false, code: 'INVALID' });
    });
});
