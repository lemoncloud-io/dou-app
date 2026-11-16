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
        /** A shell that never answers a write. */
        saveHangs?: boolean;
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
                if (opts.saveHangs) return new Promise<boolean>(() => undefined);
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

describe('secretStorageMigration and the device guest id', () => {
    const GUEST = 'chatic-delegator-id';
    const boot = (store: NativeSecureStore, web: MemoryStore, afterLogout = false, tab = new MemoryStore()) =>
        secretStorageMigration.prepare({ vault: store, plain: web, web, tab, afterLogout });
    /** The copy is not awaited by the boot; this waits for the store's queue, which it joined. */
    const settled = (store: NativeSecureStore) => store.flush().catch(() => undefined);

    it('copies it into a vault that holds the session but not the id, and keeps the plain copy', async () => {
        const { store, vault } = shell({ vault: { [RELAY]: 'r' } });
        const web = webWith({ [GUEST]: 'guest-1' });

        expect(await boot(store, web)).toBe('vault');
        await settled(store);

        expect(vault).toEqual({ [RELAY]: 'r', [GUEST]: 'guest-1' });
        expect(store.get(GUEST)).toBe('guest-1');
        expect(web.get(GUEST)).toBe('guest-1');
    });

    it('copies it after moving the tokens, and does not delete it with their web copy', async () => {
        const { store, vault } = shell();
        const web = webWith({ [RELAY]: 'r', [GUEST]: 'guest-1' });

        expect(await boot(store, web)).toBe('migrated');
        await settled(store);

        expect(vault).toEqual({ [RELAY]: 'r', [GUEST]: 'guest-1' });
        expect(web.keys()).toEqual([GUEST]);
    });

    it('copies it into an empty vault too', async () => {
        const { store, vault } = shell();
        const web = webWith({ [GUEST]: 'guest-1' });

        expect(await boot(store, web)).toBe('empty');
        await settled(store);

        expect(vault).toEqual({ [GUEST]: 'guest-1' });
    });

    it('does not take a vault holding only the id for a signed-in one, so a web copy of the tokens is moved, not deleted', async () => {
        const { store, vault } = shell({ vault: { [GUEST]: 'guest-1' } });
        const web = webWith({ [RELAY]: 'r', [GUEST]: 'guest-1' });

        expect(await boot(store, web)).toBe('migrated');

        expect(vault).toEqual({ [RELAY]: 'r', [GUEST]: 'guest-1' });
        expect(store.get(RELAY)).toBe('r');
    });

    it('never overwrites an id the vault already holds, and leaves the plain one as it is', async () => {
        const { store, vault, calls } = shell({ vault: { [RELAY]: 'r', [GUEST]: 'in-vault' } });
        const web = webWith({ [GUEST]: 'in-plain' });

        await boot(store, web);
        await settled(store);

        expect(vault[GUEST]).toBe('in-vault');
        expect(web.get(GUEST)).toBe('in-plain');
        expect(calls).not.toContain('save');
    });

    it('writes nothing when the plain store has no id', async () => {
        const { store, calls } = shell({ vault: { [RELAY]: 'r' } });

        await boot(store, new MemoryStore());
        await settled(store);

        expect(calls).not.toContain('save');
    });

    it('keeps the run on the vault, with its tokens, when the shell refuses the copy', async () => {
        const { store, vault } = shell({ vault: { [RELAY]: 'r' }, saveOk: false });
        const web = webWith({ [GUEST]: 'guest-1' });

        await expect(boot(store, web)).resolves.toBe('vault');
        await settled(store);

        expect(store.status).toBe('available');
        expect(store.get(RELAY)).toBe('r');
        expect(vault[GUEST]).toBeUndefined();
        expect(web.get(GUEST)).toBe('guest-1');
    });

    it('does not hold the boot for a shell that never answers the copy', async () => {
        const { store } = shell({ vault: { [RELAY]: 'r' }, saveHangs: true });
        const web = webWith({ [GUEST]: 'guest-1' });

        await expect(boot(store, web)).resolves.toBe('vault');
        expect(store.status).toBe('available');
    });

    it('does not copy it while the vault is unavailable, and keeps the plain copy', async () => {
        const { store, vault } = shell({ read: 'unavailable' });
        const web = webWith({ [GUEST]: 'guest-1' });

        await boot(store, web);

        expect(vault).toEqual({});
        expect(web.get(GUEST)).toBe('guest-1');
    });

    it('does not copy it into a vault a logout is emptying', async () => {
        const { store, vault } = shell({ vault: { [RELAY]: 'r' } });
        const web = webWith({ [GUEST]: 'left-behind' });

        expect(await boot(store, web, true)).toBe('logout-finished');
        await settled(store);

        expect(vault).toEqual({});
    });

    it('drops a copy an unavailable run left in the tab once the vault answers again, and keeps the plain one', async () => {
        const { store } = shell({ vault: { [RELAY]: 'r' } });
        const web = webWith({ [GUEST]: 'guest-1' });
        const tab = webWith({ [GUEST]: 'left-by-an-unavailable-run', other: 'x' });

        await boot(store, web, false, tab);

        expect(tab.keys()).toEqual(['other']);
        expect(web.get(GUEST)).toBe('guest-1');
    });
});

describe('dropLemonLeftovers', () => {
    it('deletes the old lemon bundle and its language key, and leaves other keys', () => {
        const store = webWith({ '@chatic.identity_token': 't', '@chatic.i18nextLng': 'ko', other: 'x' });

        dropLemonLeftovers(store);

        expect(store.keys().sort()).toEqual(['other']);
    });
});
