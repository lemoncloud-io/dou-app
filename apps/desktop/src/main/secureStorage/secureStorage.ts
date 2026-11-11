/**
 * The desktop device vault — the `nativeSecure` storage medium the shell keeps for the web.
 *
 * One JSON `Record<string, string>`, encrypted with Electron `safeStorage` (Keychain on macOS, DPAPI
 * on Windows, the Secret Service or KWallet on Linux) into a single file under `userData`. The whole
 * record is read once at start into memory; every `StorageGet` is answered from that copy, and every
 * save rewrites the file before it is acknowledged.
 *
 * Deliberately imports no electron: `safeStorage` and the file system are injected so this runs
 * under jest (see `webUrl.ts`).
 */
import type { ISecureStorage, SecureStorageDeps, SecureStorageSnapshot, VaultState } from './types';

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT';

/** Only a plain object of string values is a vault record; anything else counts as undecryptable. */
const parseRecord = (json: string): Record<string, string> | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed as Record<string, unknown>);
    return entries.every(([, value]) => typeof value === 'string') ? (parsed as Record<string, string>) : null;
};

export class SecureStorage implements ISecureStorage {
    private state: VaultState | null = null;
    private startRead: Promise<void> | null = null;
    /** Saves and clears run one at a time, in the order they arrived. */
    private queue: Promise<unknown> = Promise.resolve();
    private readonly logError: (message: string, error?: unknown) => void;

    constructor(private readonly deps: SecureStorageDeps) {
        this.logError = deps.logError ?? ((message, error) => console.error(message, error));
    }

    /**
     * Reads the vault into memory. Called once when the app is ready, before the window exists;
     * calling it again returns the same read.
     */
    start(): Promise<void> {
        this.startRead ??= this.read().then(state => {
            this.state = state;
        });
        return this.startRead;
    }

    /** Every value, or why the vault cannot be used this run. Waits for the start read. */
    async get(): Promise<SecureStorageSnapshot> {
        await this.start();
        const state = this.current();
        if (state.status === 'unavailable') return { status: 'unavailable', reason: state.reason, values: {} };
        return { status: 'available', ...(state.reset && { reset: true as const }), values: { ...state.values } };
    }

    /**
     * Applies `set` and `remove` and writes the vault. `true` only once the file is written; a failed
     * write leaves the vault unavailable for the rest of the run.
     */
    save(set: Record<string, string>, remove: readonly string[]): Promise<boolean> {
        return this.enqueue(async () => {
            const state = this.current();
            if (state.status === 'unavailable') return false;
            const next = { ...state.values };
            for (const [key, value] of Object.entries(set)) next[key] = value;
            for (const key of remove) delete next[key];
            try {
                await this.write(next);
            } catch (error) {
                this.logError('[secure-storage] write failed; unavailable for this run', error);
                this.state = { status: 'unavailable', reason: 'error' };
                return false;
            }
            this.state = { status: 'available', values: next, reset: false };
            return true;
        });
    }

    /** Deletes the vault file and empties memory. `true` only once the file is gone. */
    clear(): Promise<boolean> {
        return this.enqueue(async () => {
            try {
                await this.deps.fs.rm(this.deps.filePath, { force: true });
            } catch (error) {
                this.logError('[secure-storage] clear failed', error);
                return false;
            }
            const state = this.current();
            if (state.status === 'available') this.state = { status: 'available', values: {}, reset: false };
            return true;
        });
    }

    private current(): VaultState {
        // Only reached after `start()` resolved, which always sets a state.
        return this.state ?? { status: 'unavailable', reason: 'error' };
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(() => this.start()).then(task);
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async read(): Promise<VaultState> {
        const { safeStorage, fs, filePath, platform } = this.deps;
        try {
            if (!safeStorage.isEncryptionAvailable()) return { status: 'unavailable', reason: 'error' };
            // Linux without a keyring falls back to a hard-coded key: "encrypted" in name only.
            if (platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
                return { status: 'unavailable', reason: 'error' };
            }
        } catch (error) {
            this.logError('[secure-storage] safeStorage check failed', error);
            return { status: 'unavailable', reason: 'error' };
        }

        let encrypted: Buffer;
        try {
            encrypted = await fs.readFile(filePath);
        } catch (error) {
            if (isMissingFile(error)) return { status: 'available', values: {}, reset: false };
            this.logError('[secure-storage] read failed', error);
            return { status: 'unavailable', reason: 'error' };
        }

        let values: Record<string, string> | null = null;
        try {
            values = parseRecord(safeStorage.decryptString(encrypted));
        } catch (error) {
            this.logError('[secure-storage] decrypt failed', error);
        }
        if (values) return { status: 'available', values, reset: false };

        // Written under another OS account or keyring, or damaged: nothing in it can be recovered,
        // so start over empty and tell the web, which signs the person in again.
        try {
            await fs.rm(filePath, { force: true });
        } catch (error) {
            this.logError('[secure-storage] could not delete an undecryptable vault', error);
        }
        return { status: 'available', values: {}, reset: true };
    }

    /** Temp file plus rename, so a crash mid-write leaves the previous vault rather than half a file. */
    private async write(values: Record<string, string>): Promise<void> {
        const { safeStorage, fs, filePath } = this.deps;
        const temp = `${filePath}.tmp`;
        const encrypted = safeStorage.encryptString(JSON.stringify(values));
        try {
            await fs.writeFile(temp, encrypted, { mode: 0o600 });
            await fs.rename(temp, filePath);
        } catch (error) {
            await fs.rm(temp, { force: true }).catch(() => undefined);
            throw error;
        }
    }
}
