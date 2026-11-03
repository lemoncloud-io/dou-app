import encHex from 'crypto-js/enc-hex';
import sha256 from 'crypto-js/sha256';

/** What one origin may hold: the characters of its keys and its values serialized. */
export const SUB_WEBVIEW_STORAGE_LIMIT = 1024 * 1024;

/** The longest key a page may use. */
export const SUB_WEBVIEW_STORAGE_KEY_LIMIT = 200;

/** The part of an MMKV instance this storage uses, so the logic runs without the native module. */
export interface StorageFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): unknown;
    getAllKeys(): string[];
    clearAll(): void;
    /**
     * Gives back the space removed keys left behind; MMKV does not shrink by itself. It also drops
     * MMKV's memory cache, so the next read loads the whole file again: called on a clear only.
     */
    trim(): void;
}

export type StorageUsage = { used: number; limit: number };

export type StorageResult<T> = { ok: true; value: T } | { ok: false; code: 'INVALID' | 'QUOTA_EXCEEDED' };

/**
 * The storage file's id for `origin`: a prefix that keeps it apart from the app's own files, and a
 * hash, since an origin holds characters a file name cannot. Fixed: changing it would leave every
 * page's data behind under the old name.
 */
export const subWebViewStorageId = (origin: string): string =>
    `subwebview.${sha256(origin).toString(encHex).slice(0, 32)}`;

// `__proto__` is refused: as a property of the reply's entries it would set their prototype rather
// than hold the value.
const validKey = (key: unknown): key is string =>
    typeof key === 'string' && key.length >= 1 && key.length <= SUB_WEBVIEW_STORAGE_KEY_LIMIT && key !== '__proto__';

const serialize = (value: unknown): string | null => {
    try {
        const json = JSON.stringify(value);
        return json === undefined ? null : json;
    } catch {
        // A cycle, a BigInt: not JSON.
        return null;
    }
};

/**
 * One origin's storage, over its own file. Which file is the caller's choice and nobody else's — the
 * view opens it for the origin it recorded, so a page cannot name another page's.
 *
 * Usage is counted rather than read from the file, whose size includes space MMKV keeps in reserve
 * and space removed keys left. It is worked out once, on the first call, and kept up to date after.
 */
export class SubWebViewStorage {
    private used: number | null = null;

    constructor(private readonly file: StorageFile) {}

    private usage(): number {
        if (this.used === null) {
            this.used = this.file
                .getAllKeys()
                .reduce((sum, key) => sum + key.length + (this.file.getString(key)?.length ?? 0), 0);
        }
        return this.used;
    }

    private report(): StorageUsage {
        return { used: this.usage(), limit: SUB_WEBVIEW_STORAGE_LIMIT };
    }

    get(keys: unknown): StorageResult<{ entries: { [key: string]: unknown } }> {
        if (!Array.isArray(keys) || !keys.every(validKey)) return { ok: false, code: 'INVALID' };
        const entries: { [key: string]: unknown } = {};
        for (const key of keys) {
            const raw = this.file.getString(key);
            if (raw === undefined) continue;
            try {
                entries[key] = JSON.parse(raw);
            } catch {
                // Only this storage writes the file, always JSON; a value that does not parse is left out.
            }
        }
        return { ok: true, value: { entries } };
    }

    /** All entries or none: a write past the limit, or with one bad entry, changes nothing. */
    set(entries: unknown): StorageResult<StorageUsage> {
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return { ok: false, code: 'INVALID' };
        const writes: Array<[string, string]> = [];
        let next = this.usage();
        for (const [key, value] of Object.entries(entries)) {
            const json = serialize(value);
            if (!validKey(key) || json === null) return { ok: false, code: 'INVALID' };
            const before = this.file.getString(key);
            next += json.length - (before === undefined ? -key.length : before.length);
            writes.push([key, json]);
        }
        if (next > SUB_WEBVIEW_STORAGE_LIMIT) return { ok: false, code: 'QUOTA_EXCEEDED' };
        try {
            for (const [key, json] of writes) this.file.set(key, json);
        } catch (error) {
            // The device refused a write (a full disk): what was written stays, so count afresh.
            this.used = null;
            throw error;
        }
        this.used = next;
        return { ok: true, value: this.report() };
    }

    remove(keys: unknown): StorageResult<StorageUsage> {
        if (!Array.isArray(keys) || !keys.every(validKey)) return { ok: false, code: 'INVALID' };
        let next = this.usage();
        for (const key of keys) {
            const before = this.file.getString(key);
            if (before === undefined) continue;
            this.file.remove(key);
            next -= key.length + before.length;
        }
        this.used = next;
        return { ok: true, value: this.report() };
    }

    clear(): StorageResult<Record<string, never>> {
        this.file.clearAll();
        this.file.trim();
        this.used = 0;
        return { ok: true, value: {} };
    }

    info(): StorageResult<StorageUsage & { keys: string[] }> {
        return { ok: true, value: { keys: this.file.getAllKeys(), ...this.report() } };
    }
}
