import encHex from 'crypto-js/enc-hex';
import sha256 from 'crypto-js/sha256';

export const SUB_WEBVIEW_STORAGE_LIMIT = 1024 * 1024;

export const SUB_WEBVIEW_STORAGE_KEY_LIMIT = 200;

export interface StorageFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): unknown;
    getAllKeys(): string[];
    clearAll(): void;
    trim(): void;
}

export type StorageUsage = { used: number; limit: number };

export type StorageResult<T> = { ok: true; value: T } | { ok: false; code: 'INVALID' | 'QUOTA_EXCEEDED' };

export const subWebViewStorageId = (origin: string): string =>
    `subwebview.${sha256(origin).toString(encHex).slice(0, 32)}`;

const validKey = (key: unknown): key is string =>
    typeof key === 'string' && key.length >= 1 && key.length <= SUB_WEBVIEW_STORAGE_KEY_LIMIT && key !== '__proto__';

const serialize = (value: unknown): string | null => {
    try {
        const json = JSON.stringify(value);
        return json === undefined ? null : json;
    } catch {
        return null;
    }
};

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
