import { MemoryStore, NativeSecureStore, type NativeReadResult } from '@chatic/storage';

import { dropLemonLeftovers } from './lemonLeftovers.util';
import { secretStorageMigration } from './secretStorageMigration';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/transport', () => ({ legacyLemonKeyPrefix: () => '@chatic.' }));

const RELAY = 'chatic-relay-token';
const CLOUD = 'chatic-cloud-token';
const MARKER = 'chatic-secret-logout-pending';

/** A shell whose vault starts as `vault` and answers reads as `read` says, recording every call in order. */
const shell = (
    opts: {
        read?: NativeReadResult['status'];
        vault?: Record<string, string>;
        saveOk?: boolean;
        clearOk?: boolean;
    } = {}
) => {
    const vault: Record<string, string> = { ...(opts.vault ?? {}) };
    const calls: string[] = [];
    const store = new NativeSecureStore({
        fallback: new MemoryStore(),
        channel: {
            read: async () => {
                calls.push('read');
                return opts.read === 'unavailable'
                    ? { status: 'unavailable', reason: 'locked', values: {} }
                    : { status: 'available', values: { ...vault } };
            },
            save: async (set, remove) => {
                calls.push('save');
                if (opts.saveOk === false) return false;
                Object.assign(vault, set);
                remove.forEach(key => delete vault[key]);
                return true;
            },
            clear: async () => {
                calls.push('clear');
                if (opts.clearOk === false) return false;
                Object.keys(vault).forEach(key => delete vault[key]);
                return true;
            },
        },
    });
    return { store, vault, calls };
};

const webWith = (entries: Record<string, string>) => {
    const web = new MemoryStore();
    Object.entries(entries).forEach(([key, value]) => web.set(key, value));
    return web;
};

describe('secretStorageMigration', () => {
    it('moves a web copy into an empty vault, then deletes the copy and the old lemon bundle', async () => {
        const { store, vault } = shell();
        const web = webWith({ [RELAY]: 'r', [CLOUD]: 'c', '@chatic.access_key_id': 'a', '@chatic.i18nextLng': 'ko' });

        const outcome = await secretStorageMigration.prepare({
            vault: store,
            plain: web,
            web,
            tab: new MemoryStore(),
            afterLogout: false,
        });

        expect(outcome).toBe('migrated');
        expect(vault).toEqual({ [RELAY]: 'r', [CLOUD]: 'c' });
        expect(web.keys()).toEqual([]);
        expect(store.get(RELAY)).toBe('r');
    });

    it('keeps the web copy when the vault refuses the move, and stays signed in for the run', async () => {
        const { store } = shell({ saveOk: false });
        const web = webWith({ [RELAY]: 'r' });

        const outcome = await secretStorageMigration.prepare({
            vault: store,
            plain: web,
            web,
            tab: new MemoryStore(),
            afterLogout: false,
        });

        expect(outcome).toBe('migration-refused');
        expect(web.get(RELAY)).toBe('r');
        expect(store.get(RELAY)).toBe('r');
        expect(store.status).toBe('unavailable');
    });

    it('takes the vault as the truth when it holds values, and deletes a leftover web copy', async () => {
        const { store } = shell({ vault: { [RELAY]: 'from-vault' } });
        const web = webWith({ [RELAY]: 'stale' });

        const outcome = await secretStorageMigration.prepare({
            vault: store,
            plain: web,
            web,
            tab: new MemoryStore(),
            afterLogout: false,
        });

        expect(outcome).toBe('vault');
        expect(store.get(RELAY)).toBe('from-vault');
        expect(web.get(RELAY)).toBeNull();
    });

    it('signs this run in from the web copy when the vault is unavailable, and keeps the copy', async () => {
        const { store } = shell({ read: 'unavailable' });
        const web = webWith({ [RELAY]: 'r' });

        const outcome = await secretStorageMigration.prepare({
            vault: store,
            plain: web,
            web,
            tab: new MemoryStore(),
            afterLogout: false,
        });

        expect(outcome).toBe('unavailable-with-web-copy');
        expect(store.get(RELAY)).toBe('r');
        expect(web.get(RELAY)).toBe('r');
    });

    it('treats an unavailable vault with no web copy as unavailable, not as signed out data', async () => {
        const { store } = shell({ read: 'unavailable' });
        const web = new MemoryStore();

        await expect(
            secretStorageMigration.prepare({
                vault: store,
                plain: web,
                web,
                tab: new MemoryStore(),
                afterLogout: false,
            })
        ).resolves.toBe('unavailable');
    });

    it('is signed out when both are empty', async () => {
        const { store } = shell();
        const web = new MemoryStore();

        await expect(
            secretStorageMigration.prepare({
                vault: store,
                plain: web,
                web,
                tab: new MemoryStore(),
                afterLogout: false,
            })
        ).resolves.toBe('empty');
    });

    it('after a logout, empties the vault before reading it, so no token comes back', async () => {
        const { store, vault, calls } = shell({ vault: { [RELAY]: 'r' } });
        const web = webWith({ [RELAY]: 'r' });

        const outcome = await secretStorageMigration.prepare({
            vault: store,
            plain: web,
            web,
            tab: new MemoryStore(),
            afterLogout: true,
        });

        expect(outcome).toBe('logout-finished');
        expect(calls).toEqual(['clear', 'read']);
        expect(vault).toEqual({});
        expect(store.get(RELAY)).toBeNull();
        expect(web.get(RELAY)).toBeNull();
    });

    it('finishes a logout the last page could not confirm, and keeps the marker until one is confirmed', async () => {
        const refused = shell({ vault: { [RELAY]: 'r' }, clearOk: false });
        const plain = webWith({ [MARKER]: '1' });

        await secretStorageMigration.prepare({
            vault: refused.store,
            plain,
            web: plain,
            tab: new MemoryStore(),
            afterLogout: false,
        });
        expect(plain.get(MARKER)).toBe('1');
        expect(refused.store.get(RELAY)).toBeNull();

        const confirmed = shell({ vault: { [RELAY]: 'r' } });
        await secretStorageMigration.prepare({
            vault: confirmed.store,
            plain,
            web: plain,
            tab: new MemoryStore(),
            afterLogout: false,
        });
        expect(plain.get(MARKER)).toBeNull();
        expect(confirmed.vault).toEqual({});
    });
});

describe('secretStorageMigration and a tab copy an unavailable run left', () => {
    it('drops it once the vault answers again, so it cannot be read back later', async () => {
        const { store } = shell({ vault: { [RELAY]: 'from-vault' } });
        const tab = webWith({ [RELAY]: 'left-by-an-unavailable-run', other: 'x' });
        const web = new MemoryStore();

        await secretStorageMigration.prepare({ vault: store, plain: web, web, tab, afterLogout: false });

        expect(tab.keys()).toEqual(['other']);
    });

    it('drops it after a logout, even when the vault cannot be read', async () => {
        const { store } = shell({ read: 'unavailable' });
        const tab = webWith({ [RELAY]: 'left-by-an-unavailable-run' });
        const web = new MemoryStore();

        await secretStorageMigration.prepare({ vault: store, plain: web, web, tab, afterLogout: true });

        expect(tab.get(RELAY)).toBeNull();
        expect(store.get(RELAY)).toBeNull();
    });
});

describe('dropLemonLeftovers', () => {
    it('deletes the old lemon bundle and its language key, and leaves other keys', () => {
        const store = webWith({ '@chatic.identity_token': 't', '@chatic.i18nextLng': 'ko', other: 'x' });

        dropLemonLeftovers(store);

        expect(store.keys().sort()).toEqual(['other']);
    });
});
