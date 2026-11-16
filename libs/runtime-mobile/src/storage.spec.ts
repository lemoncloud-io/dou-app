import type { NativeReadResult } from '@chatic/storage';

import type { AppStateSource } from './foreground';
import { keyValueStoreOn, nativeSecretStore, waitForUnlockedVault } from './storage';
import type { DeviceVault, KeyValueFile } from './storage';

jest.mock('react-native', () => ({ AppState: {} }));

/** A key-value file held in a map, typed like MMKV's: strings in, strings out. */
const fakeFile = (): KeyValueFile & { entries: Map<string, string> } => {
    const entries = new Map<string, string>();
    return {
        entries,
        getString: key => entries.get(key),
        set: (key, value) => void entries.set(key, value),
        remove: key => entries.delete(key),
        clearAll: () => entries.clear(),
        getAllKeys: () => [...entries.keys()],
    };
};

/** A vault that answers `reads` in turn (the last one from then on), and records every write. */
const fakeVault = (...reads: NativeReadResult[]) => {
    const calls: string[] = [];
    const vault: DeviceVault & { calls: string[] } = {
        calls,
        get: jest.fn(async () => (reads.length > 1 ? reads.shift() : reads[0]) as NativeReadResult),
        save: jest.fn(async (set: Record<string, string>, remove: readonly string[]) => {
            calls.push(`save ${JSON.stringify(set)} ${JSON.stringify(remove)}`);
            return true;
        }),
        clear: jest.fn(async () => {
            calls.push('clear');
            return true;
        }),
    };
    return vault;
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** An `AppState` stand-in whose state and `change` events the test sets. */
const fakeAppState = (initial: string) => {
    const handlers = new Set<(state: string) => void>();
    const source = {
        currentState: initial,
        addEventListener: jest.fn((_type: string, handler: (state: string) => void) => {
            handlers.add(handler);
            return { remove: () => handlers.delete(handler) };
        }),
    };
    const change = (next: string) => {
        source.currentState = next;
        [...handlers].forEach(handler => handler(next));
    };
    return { source: source as unknown as AppStateSource, change, listeners: () => handlers.size };
};

describe('keyValueStoreOn', () => {
    it('keeps strings as they are, so a JSON value comes back byte for byte', () => {
        const file = fakeFile();
        const store = keyValueStoreOn(file);

        store.set('chatic-selected-cloud-id', 'c1');
        store.set('chatic-cloud-identities', '{"c1":{"uid":"u1"}}');

        expect(file.entries.get('chatic-selected-cloud-id')).toBe('c1');
        expect(store.get('chatic-cloud-identities')).toBe('{"c1":{"uid":"u1"}}');
        expect(store.keys()).toEqual(['chatic-selected-cloud-id', 'chatic-cloud-identities']);
    });

    it('answers null for a missing key, and removes and clears', () => {
        const store = keyValueStoreOn(fakeFile());
        store.set('a', '1');
        store.set('b', '2');

        expect(store.get('missing')).toBeNull();
        store.remove('a');
        expect(store.get('a')).toBeNull();
        store.clear();
        expect(store.keys()).toEqual([]);
    });
});

describe('nativeSecretStore', () => {
    it('loads the vault into memory and answers reads from it', async () => {
        const vault = fakeVault({ status: 'available', values: { 'chatic-relay-token': 't' } });
        const store = nativeSecretStore(vault);

        await store.hydrate();

        expect(store.get('chatic-relay-token')).toBe('t');
        expect(store.status).toBe('available');
    });

    it('writes to the vault after, in the order the writes were made', async () => {
        const vault = fakeVault({ status: 'available', values: {} });
        const store = nativeSecretStore(vault);
        await store.hydrate();

        store.set('a', '1');
        store.set('b', '2');
        await settle();
        store.clear();
        store.set('c', '3');
        await store.flush();

        expect(vault.calls).toEqual(['save {"a":"1","b":"2"} []', 'clear', 'save {"c":"3"} []']);
    });

    it('keeps the session in memory for the run when the vault cannot be read, and never writes it', async () => {
        const vault = fakeVault({ status: 'unavailable', reason: 'error', values: {} });
        const store = nativeSecretStore(vault);

        await store.hydrate();
        store.set('chatic-relay-token', 't');
        await settle();

        expect(store.status).toBe('unavailable');
        expect(store.get('chatic-relay-token')).toBe('t');
        expect(vault.save).not.toHaveBeenCalled();
    });

    it('takes a vault that does not answer in time as unavailable, so the boot goes on', async () => {
        const vault = fakeVault({ status: 'available', values: {} });
        (vault.get as jest.Mock).mockImplementation(() => new Promise(() => undefined));
        const store = nativeSecretStore(vault, { timeoutMs: 10 });

        await expect(store.hydrate()).resolves.toMatchObject({ status: 'unavailable', reason: 'error' });
        expect(store.status).toBe('unavailable');
    });

    it('reads a vault that could not be decrypted as the empty vault the app reset it to', async () => {
        const vault = fakeVault({ status: 'available', reset: true, values: {} });
        const store = nativeSecretStore(vault);

        await expect(store.hydrate()).resolves.toMatchObject({ reset: true });
        expect(store.status).toBe('available');
        expect(store.keys()).toEqual([]);
    });
});

describe('waitForUnlockedVault', () => {
    afterEach(() => jest.useRealTimers());

    it('answers at once when the vault is not locked', async () => {
        const vault = fakeVault({ status: 'unavailable', reason: 'error', values: {} });
        const appState = fakeAppState('background');

        await expect(waitForUnlockedVault(vault, appState.source)).resolves.toEqual({
            status: 'unavailable',
            reason: 'error',
            values: {},
        });
        expect(vault.get).toHaveBeenCalledTimes(1);
    });

    it('waits while the vault is locked, and asks again when the app comes to the front', async () => {
        const vault = fakeVault(
            { status: 'unavailable', reason: 'locked', values: {} },
            { status: 'unavailable', reason: 'locked', values: {} },
            { status: 'available', values: { 'chatic-relay-token': 't' } }
        );
        const appState = fakeAppState('background');
        let answered = false;
        const waiting = waitForUnlockedVault(vault, appState.source).then(read => {
            answered = true;
            return read;
        });

        await settle();
        appState.change('inactive');
        await settle();
        expect(answered).toBe(false);

        appState.change('active');
        await settle();
        expect(answered).toBe(false);
        appState.change('background');
        appState.change('active');

        await expect(waiting).resolves.toEqual({ status: 'available', values: { 'chatic-relay-token': 't' } });
        expect(vault.get).toHaveBeenCalledTimes(3);
        expect(appState.listeners()).toBe(0);
    });

    it('asks again after a moment when it read locked with the app already in front', async () => {
        jest.useFakeTimers();
        const vault = fakeVault(
            { status: 'unavailable', reason: 'locked', values: {} },
            { status: 'available', values: {} }
        );
        const appState = fakeAppState('active');

        const waiting = waitForUnlockedVault(vault, appState.source);
        await jest.advanceTimersByTimeAsync(1000);

        await expect(waiting).resolves.toEqual({ status: 'available', values: {} });
        expect(vault.get).toHaveBeenCalledTimes(2);
    });

    it('asks only once more while in front, then waits for the next return to the front', async () => {
        jest.useFakeTimers();
        const vault = fakeVault(
            { status: 'unavailable', reason: 'locked', values: {} },
            { status: 'unavailable', reason: 'locked', values: {} },
            { status: 'available', values: {} }
        );
        const appState = fakeAppState('active');

        const waiting = waitForUnlockedVault(vault, appState.source);
        await jest.advanceTimersByTimeAsync(10_000);
        expect(vault.get).toHaveBeenCalledTimes(2);

        appState.change('background');
        appState.change('active');
        await expect(waiting).resolves.toEqual({ status: 'available', values: {} });
        expect(vault.get).toHaveBeenCalledTimes(3);
    });
});
