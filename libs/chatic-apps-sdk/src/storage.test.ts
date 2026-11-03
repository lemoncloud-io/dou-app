import { ChaticAppsError } from './errors';
import { browserStorage, ruledStore, storageOver, type StoreFile } from './storage';

const memory = (): StoreFile => {
    const data = new Map<string, string>();
    return {
        read: key => data.get(key),
        write: (key, json) => void data.set(key, json),
        delete: key => void data.delete(key),
        keys: () => [...data.keys()],
    };
};

describe('ruledStore', () => {
    it("keeps the app's limits: key length, JSON, and the total", () => {
        const store = ruledStore(memory());

        expect(store.set({ '': 1 })).toEqual({ ok: false, code: 'INVALID' });
        expect(store.set({ ['k'.repeat(201)]: 1 })).toEqual({ ok: false, code: 'INVALID' });
        expect(store.set({ a: BigInt(1) })).toEqual({ ok: false, code: 'INVALID' });
        expect(store.set(JSON.parse('{"__proto__": 1}'))).toEqual({ ok: false, code: 'INVALID' });
        expect(store.set({ a: 'x'.repeat(1024 * 1024) })).toEqual({ ok: false, code: 'QUOTA_EXCEEDED' });
        expect(store.set({ ab: 'xyz' })).toEqual({ ok: true, value: { used: 7, limit: 1024 * 1024 } });
    });

    it('writes all the entries or none', () => {
        const file = memory();
        const store = ruledStore(file);

        expect(store.set({ a: 1, '': 2 })).toEqual({ ok: false, code: 'INVALID' });
        expect(file.keys()).toEqual([]);
    });
});

describe('storageOver', () => {
    it('reads one key, and leaves out what is not stored', async () => {
        const storage = storageOver({
            get: async keys => ({ entries: keys.includes('a') ? { a: 1 } : {} }),
            set: jest.fn(),
            remove: jest.fn(),
            clear: jest.fn(),
            info: jest.fn(),
        });

        await expect(storage.get('a')).resolves.toBe(1);
        await expect(storage.get('b')).resolves.toBeUndefined();
    });

    it.each([
        ['undefined', undefined],
        ['a function', () => 1],
        ['a symbol', Symbol('s')],
    ])('refuses %s instead of letting JSON drop it in silence', async (_label, value) => {
        const set = jest.fn();
        const storage = storageOver({ get: jest.fn(), set, remove: jest.fn(), clear: jest.fn(), info: jest.fn() });

        await expect(storage.set('a', value)).rejects.toEqual(expect.objectContaining({ code: 'INVALID' }));
        expect(set).not.toHaveBeenCalled();
    });
});

describe('browserStorage', () => {
    afterEach(() => localStorage.clear());

    it("stores under a prefix of its own, apart from the page's own localStorage", async () => {
        localStorage.setItem('mine', 'page data');
        const storage = browserStorage();

        await storage.set('level', 3);

        expect(localStorage.getItem('chatic-apps.storage:level')).toBe('3');
        await expect(storage.keys()).resolves.toEqual(['level']);
        await storage.clear();
        expect(localStorage.getItem('mine')).toBe('page data');
    });

    it('fails past the limit with the code the app would answer', async () => {
        const storage = browserStorage();
        for (let i = 0; i < 16; i++) await storage.set(`chunk${i}`, 'x'.repeat(64000));

        await expect(storage.set('more', 'x'.repeat(64000))).rejects.toEqual(
            expect.objectContaining({ code: 'QUOTA_EXCEEDED' })
        );
    });

    it("refuses one call over the app's message limit, as the app does", async () => {
        await expect(browserStorage().set('a', 'x'.repeat(70 * 1024))).rejects.toEqual(
            expect.objectContaining({ code: 'TOO_LARGE' })
        );
    });

    it('leaves out a value under its prefix that is not JSON', async () => {
        localStorage.setItem('chatic-apps.storage:broken', '{');
        localStorage.setItem('chatic-apps.storage:fine', '1');

        await expect(browserStorage().getMany(['broken', 'fine'])).resolves.toEqual({ fine: 1 });
    });

    it("fails with QUOTA_EXCEEDED when the browser's own storage is full", async () => {
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        });

        await expect(browserStorage().set('a', 1)).rejects.toEqual(expect.objectContaining({ code: 'QUOTA_EXCEEDED' }));
        setItem.mockRestore();
    });

    it('fails with NOT_SUPPORTED when the browser refuses localStorage', async () => {
        const getter = jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new Error('SecurityError');
        });

        const failure = await browserStorage()
            .keys()
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ChaticAppsError);
        expect(failure).toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
        getter.mockRestore();
    });
});
