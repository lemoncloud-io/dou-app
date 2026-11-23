import type { ISecureStorage, SecureStorageDeps, SecureStorageSnapshot, VaultState } from './types';

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT';

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
    private queue: Promise<unknown> = Promise.resolve();
    private readonly logError: (message: string, error?: unknown) => void;

    constructor(private readonly deps: SecureStorageDeps) {
        this.logError = deps.logError ?? ((message, error) => console.error(message, error));
    }

    start(): Promise<void> {
        this.startRead ??= this.read().then(state => {
            this.state = state;
        });
        return this.startRead;
    }

    async get(): Promise<SecureStorageSnapshot> {
        await this.start();
        const state = this.current();
        if (state.status === 'unavailable') return { status: 'unavailable', reason: state.reason, values: {} };
        return { status: 'available', ...(state.reset && { reset: true as const }), values: { ...state.values } };
    }

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

        try {
            await fs.rm(filePath, { force: true });
        } catch (error) {
            this.logError('[secure-storage] could not delete an undecryptable vault', error);
        }
        return { status: 'available', values: {}, reset: true };
    }

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
