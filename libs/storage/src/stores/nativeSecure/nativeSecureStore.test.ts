import { MemoryStore } from '../memoryStore';
import { isNativeStore } from './isNativeStore.util';
import { NativeSecureStore } from './nativeSecureStore';

import type { NativeReadResult, NativeStorageChannel } from './types';

/** A shell that answers as told, and records what it was sent. */
const fakeShell = (read: NativeReadResult | Promise<NativeReadResult> = { status: 'available', values: {} }) => {
    const saves: { set: Record<string, string>; remove: string[] }[] = [];
    const vault: Record<string, string> = {};
    let clears = 0;
    const answers = { save: true, clear: true };
    const channel: NativeStorageChannel = {
        read: () => Promise.resolve(read),
        save: async (set, remove) => {
            saves.push({ set, remove });
            if (!answers.save) return false;
            Object.assign(vault, set);
            remove.forEach(key => delete vault[key]);
            return true;
        },
        clear: async () => {
            clears += 1;
            if (answers.clear) Object.keys(vault).forEach(key => delete vault[key]);
            return answers.clear;
        },
    };
    return { channel, saves, vault, answers, clears: () => clears };
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('NativeSecureStore', () => {
    it('answers from memory once hydrated', async () => {
        const shell = fakeShell({ status: 'available', values: { token: 't1' } });
        const store = new NativeSecureStore({ channel: shell.channel, fallback: new MemoryStore() });

        const result = await store.hydrate();

        expect(result.status).toBe('available');
        expect(store.status).toBe('available');
        expect(store.get('token')).toBe('t1');
        expect(store.keys()).toEqual(['token']);
    });

    it('sends the writes of one turn as one save, with the last value of each key', async () => {
        const shell = fakeShell();
        const store = new NativeSecureStore({ channel: shell.channel, fallback: new MemoryStore() });
        await store.hydrate();

        store.set('a', '1');
        store.set('a', '2');
        store.set('b', '3');
        store.remove('b');
        await settle();

        expect(shell.saves).toEqual([{ set: { a: '2' }, remove: ['b'] }]);
        expect(shell.vault).toEqual({ a: '2' });
    });

    it('resolves flush only once the shell confirmed the writes', async () => {
        const shell = fakeShell();
        const store = new NativeSecureStore({ channel: shell.channel, fallback: new MemoryStore() });
        await store.hydrate();

        store.set('token', 't');
        await store.flush();

        expect(shell.vault).toEqual({ token: 't' });
    });

    it('clears the vault on clear, and rejects flush when the shell refuses', async () => {
        const shell = fakeShell({ status: 'available', values: { token: 't' } });
        const store = new NativeSecureStore({ channel: shell.channel, fallback: new MemoryStore() });
        await store.hydrate();

        store.clear();
        await store.flush();
        expect(shell.clears()).toBe(1);
        expect(store.keys()).toEqual([]);

        shell.answers.clear = false;
        store.set('token', 'again');
        store.clear();
        await expect(store.flush()).rejects.toThrow();
    });

    it('falls back for the run when the vault is unavailable, and never reports that as empty data', async () => {
        const fallback = new MemoryStore();
        const shell = fakeShell({ status: 'unavailable', reason: 'locked', values: {} });
        const store = new NativeSecureStore({ channel: shell.channel, fallback });

        const result = await store.hydrate();
        store.set('token', 't');

        expect(result).toEqual({ status: 'unavailable', reason: 'locked', values: {} });
        expect(store.status).toBe('unavailable');
        expect(fallback.get('token')).toBe('t');
        expect(store.get('token')).toBe('t');
        expect(shell.saves).toEqual([]);
        await expect(store.flush()).rejects.toThrow();
    });

    it('reads a shell that never answers as unavailable, not as empty', async () => {
        const channel: NativeStorageChannel = {
            read: () => new Promise(() => undefined),
            save: async () => true,
            clear: async () => true,
        };
        const store = new NativeSecureStore({ channel, fallback: new MemoryStore(), timeoutMs: 10 });

        await expect(store.hydrate()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
        expect(store.status).toBe('unavailable');
    });

    it('moves what it holds to the fallback when a save is refused, so the run stays signed in', async () => {
        const fallback = new MemoryStore();
        const shell = fakeShell({ status: 'available', values: { relay: 'r' } });
        const store = new NativeSecureStore({ channel: shell.channel, fallback });
        await store.hydrate();

        shell.answers.save = false;
        store.set('cloud', 'c');
        await expect(store.flush()).rejects.toThrow();

        expect(store.status).toBe('unavailable');
        expect(fallback.get('relay')).toBe('r');
        expect(fallback.get('cloud')).toBe('c');
        expect(store.get('cloud')).toBe('c');
    });

    it('clears only its own keys from the fallback', async () => {
        const fallback = new MemoryStore();
        fallback.set('someone-else', 'x');
        const shell = fakeShell({ status: 'unavailable', reason: 'error', values: {} });
        const store = new NativeSecureStore({ channel: shell.channel, fallback });
        await store.hydrate();
        store.set('token', 't');

        store.clear();

        expect(fallback.keys()).toEqual(['someone-else']);
        expect(store.keys()).toEqual([]);
    });
});

describe('NativeSecureStore.offer', () => {
    const hydrated = async (values: Record<string, string> = {}) => {
        const shell = fakeShell({ status: 'available', values });
        Object.assign(shell.vault, values);
        const store = new NativeSecureStore({ channel: shell.channel, fallback: new MemoryStore() });
        await store.hydrate();
        return { shell, store };
    };

    it('writes a key the store does not hold, and answers once the shell confirmed it', async () => {
        const { shell, store } = await hydrated({ token: 't' });

        await expect(store.offer('id', 'v')).resolves.toBe(true);

        expect(shell.vault).toEqual({ token: 't', id: 'v' });
        expect(store.get('id')).toBe('v');
    });

    it('leaves the store on the vault, with what it holds, when the shell refuses', async () => {
        const { shell, store } = await hydrated({ token: 't' });
        shell.answers.save = false;

        await expect(store.offer('id', 'v')).resolves.toBe(false);

        expect(store.status).toBe('available');
        expect(store.get('token')).toBe('t');
        expect(store.get('id')).toBeNull();
    });

    it('never overwrites a key the store holds', async () => {
        const { shell, store } = await hydrated({ id: 'held' });

        await expect(store.offer('id', 'other')).resolves.toBe(false);

        expect(shell.saves).toEqual([]);
        expect(store.get('id')).toBe('held');
    });

    it('writes nothing while the store is unavailable, not even to its fallback', async () => {
        const shell = fakeShell({ status: 'unavailable', reason: 'locked', values: {} });
        const fallback = new MemoryStore();
        const store = new NativeSecureStore({ channel: shell.channel, fallback });
        await store.hydrate();

        await expect(store.offer('id', 'v')).resolves.toBe(false);

        expect(shell.saves).toEqual([]);
        expect(fallback.get('id')).toBeNull();
    });

    it('lets a write made while it was in flight win, in memory and in the vault', async () => {
        const { shell, store } = await hydrated();

        const offered = store.offer('id', 'offered');
        store.remove('id');
        await offered;
        await store.flush();

        expect(store.get('id')).toBeNull();
        expect(shell.vault.id).toBeUndefined();
    });

    it('waits behind a send already queued, so the vault sees writes in order', async () => {
        const { shell, store } = await hydrated();

        store.set('id', 'set-first');
        await expect(store.offer('id', 'offered')).resolves.toBe(false);
        await settle();

        expect(shell.vault.id).toBe('set-first');
    });
});

describe('isNativeStore', () => {
    it('tells a store the shell keeps from a plain one', () => {
        const shell = fakeShell();
        expect(isNativeStore(new NativeSecureStore({ channel: shell.channel, fallback: new MemoryStore() }))).toBe(
            true
        );
        expect(isNativeStore(new MemoryStore())).toBe(false);
    });
});
