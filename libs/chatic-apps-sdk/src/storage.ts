import { ChaticAppsError } from './errors';
import type { StorageUsage } from './types';

/**
 * This page's own storage in the app: kept on the device for the page's origin, shared by no other
 * page, and kept when the user signs out. Values are JSON. At most 1,048,576 characters in all — keys
 * plus values serialized — and at most 64 KiB in one call, the app's message limit.
 */
export interface ChaticAppsStorage {
    /** The value stored under `key`, or `undefined` when there is none. */
    get<T = unknown>(key: string): Promise<T | undefined>;
    /** The values stored under `keys`; a key with nothing stored is left out. */
    getMany(keys: string[]): Promise<{ [key: string]: unknown }>;
    /** Stores `value` under `key`. Fails with `QUOTA_EXCEEDED` past the page's limit. */
    set(key: string, value: unknown): Promise<void>;
    /** Stores every entry, or — when one is refused, or together they go past the limit — none. */
    setMany(entries: { [key: string]: unknown }): Promise<void>;
    /** Removes one key or several; a key with nothing stored is no failure. */
    remove(keys: string | string[]): Promise<void>;
    /** Every key this page has stored. */
    keys(): Promise<string[]>;
    /** Removes everything this page has stored. */
    clear(): Promise<void>;
    /** What the page's storage holds and may hold, in characters. */
    usage(): Promise<StorageUsage>;
}

/** What the storage calls go through: the app's requests, or the browser's own storage. */
export interface StorageBackend {
    get(keys: string[]): Promise<{ entries: { [key: string]: unknown } }>;
    set(entries: { [key: string]: unknown }): Promise<unknown>;
    remove(keys: string[]): Promise<unknown>;
    clear(): Promise<unknown>;
    info(): Promise<StorageUsage & { keys: string[] }>;
}

/** `value` as JSON, or `null` when it has none: `undefined`, a function, a symbol, a cycle, a BigInt. */
const serialize = (value: unknown): string | null => {
    try {
        return JSON.stringify(value) ?? null;
    } catch {
        return null;
    }
};

export const storageOver = (backend: StorageBackend): ChaticAppsStorage => {
    // The message to the app is JSON, which drops an `undefined`, a function or a symbol without a
    // word: the write would succeed and store nothing. Refused here, as the browser and the mock do.
    const setMany = (entries: { [key: string]: unknown }) =>
        Object.values(entries ?? {}).every(value => serialize(value) !== null)
            ? backend.set(entries).then(() => undefined)
            : Promise.reject(
                  new ChaticAppsError('INVALID', 'Values must be JSON; remove a key rather than storing undefined.')
              );
    return {
        get: <T>(key: string) => backend.get([key]).then(reply => reply.entries[key] as T | undefined),
        getMany: keys => backend.get(keys).then(reply => reply.entries),
        set: (key, value) => setMany({ [key]: value }),
        setMany,
        remove: keys => backend.remove(typeof keys === 'string' ? [keys] : keys).then(() => undefined),
        keys: () => backend.info().then(reply => reply.keys),
        clear: () => backend.clear().then(() => undefined),
        usage: () => backend.info().then(({ used, limit }) => ({ used, limit })),
    };
};

/** The app's limits, which the browser fallback and the mock keep too, so a page meets them early. */
const STORAGE_LIMIT = 1024 * 1024;
const KEY_LIMIT = 200;
/** The app's limit on one message, which holds a write's entries. */
const MESSAGE_LIMIT = 64 * 1024;

/** A plain key-value store of serialized values. */
export interface StoreFile {
    read(key: string): string | undefined;
    write(key: string, json: string): void;
    delete(key: string): void;
    keys(): string[];
}

type Outcome<T> = { ok: true; value: T } | { ok: false; code: 'INVALID' | 'QUOTA_EXCEEDED' };

// `__proto__` is refused, as the app refuses it: as a property of the entries it would set their
// prototype rather than hold the value.
const validKey = (key: unknown): key is string =>
    typeof key === 'string' && key.length >= 1 && key.length <= KEY_LIMIT && key !== '__proto__';

/** The app's storage rules over `file`: what it answers, as a value or a code. */
export const ruledStore = (file: StoreFile) => {
    const used = () => file.keys().reduce((sum, key) => sum + key.length + (file.read(key)?.length ?? 0), 0);
    const report = () => ({ used: used(), limit: STORAGE_LIMIT });
    return {
        get(keys: unknown): Outcome<{ entries: { [key: string]: unknown } }> {
            if (!Array.isArray(keys) || !keys.every(validKey)) return { ok: false, code: 'INVALID' };
            const entries: { [key: string]: unknown } = {};
            for (const key of keys) {
                const raw = file.read(key);
                if (raw === undefined) continue;
                try {
                    entries[key] = JSON.parse(raw);
                } catch {
                    // Written by something else under the prefix; left out, as the app leaves out a
                    // value it cannot read.
                }
            }
            return { ok: true, value: { entries } };
        },
        set(entries: unknown): Outcome<StorageUsage> {
            if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
                return { ok: false, code: 'INVALID' };
            }
            const writes: Array<[string, string]> = [];
            let next = used();
            for (const [key, value] of Object.entries(entries)) {
                const json = serialize(value);
                if (!validKey(key) || json === null) return { ok: false, code: 'INVALID' };
                const before = file.read(key);
                next += json.length - (before === undefined ? -key.length : before.length);
                writes.push([key, json]);
            }
            if (next > STORAGE_LIMIT) return { ok: false, code: 'QUOTA_EXCEEDED' };
            writes.forEach(([key, json]) => file.write(key, json));
            return { ok: true, value: report() };
        },
        remove(keys: unknown): Outcome<StorageUsage> {
            if (!Array.isArray(keys) || !keys.every(validKey)) return { ok: false, code: 'INVALID' };
            keys.forEach(key => file.delete(key));
            return { ok: true, value: report() };
        },
        clear(): Outcome<Record<string, never>> {
            file.keys().forEach(key => file.delete(key));
            return { ok: true, value: {} };
        },
        info(): Outcome<StorageUsage & { keys: string[] }> {
            return { ok: true, value: { keys: file.keys(), ...report() } };
        },
    };
};

const PREFIX = 'chatic-apps.storage:';

/** `localStorage`, under a prefix that keeps these keys apart from the page's own. */
const localFile = (local: Storage): StoreFile => ({
    read: key => local.getItem(PREFIX + key) ?? undefined,
    write: (key, json) => local.setItem(PREFIX + key, json),
    delete: key => local.removeItem(PREFIX + key),
    keys: () => {
        const keys: string[] = [];
        for (let i = 0; i < local.length; i++) {
            const key = local.key(i);
            if (key?.startsWith(PREFIX)) keys.push(key.slice(PREFIX.length));
        }
        return keys;
    },
});

/**
 * The browser tab's stand-in: the same calls and limits over `localStorage`, the one-message limit
 * included. A browser that refuses `localStorage` — a private window, a blocked site — fails each call
 * with `NOT_SUPPORTED`; one whose own quota runs out first fails the write with `QUOTA_EXCEEDED`.
 */
export const browserStorage = (): ChaticAppsStorage => {
    const settle = <T>(run: (store: ReturnType<typeof ruledStore>) => Outcome<T>): Promise<T> => {
        let outcome: Outcome<T>;
        try {
            outcome = run(ruledStore(localFile(window.localStorage)));
        } catch (error) {
            if ((error as { name?: string })?.name === 'QuotaExceededError') {
                return Promise.reject(new ChaticAppsError('QUOTA_EXCEEDED', "The browser's own storage is full."));
            }
            return Promise.reject(new ChaticAppsError('NOT_SUPPORTED', 'This browser refuses local storage.'));
        }
        return outcome.ok
            ? Promise.resolve(outcome.value)
            : Promise.reject(new ChaticAppsError(outcome.code, `The storage refused the call: ${outcome.code}.`));
    };
    return storageOver({
        get: keys => settle(store => store.get(keys)),
        set: entries =>
            (serialize({ entries })?.length ?? 0) > MESSAGE_LIMIT
                ? Promise.reject(new ChaticAppsError('TOO_LARGE', 'One call carries at most 65,536 characters.'))
                : settle(store => store.set(entries)),
        remove: keys => settle(store => store.remove(keys)),
        clear: () => settle(store => store.clear()),
        info: () => settle(store => store.info()),
    });
};
