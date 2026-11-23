import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import type { OnStorageGetPayload } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import type { ForegroundSubscriber, ISecureStorageInstallFlag, ISecureStorageService, VaultState } from './types';

const TAG = 'SECURE_STORAGE';

const ACCOUNT = 'vault';

const IOS_LOCKED = '-25308';

const ANDROID_CRYPTO_FAILED = 'E_CRYPTO_FAILED';

const defaultForegroundSubscriber: ForegroundSubscriber = onForeground => {
    const subscription = AppState.addEventListener('change', next => {
        if (next === 'active') onForeground();
    });
    return () => subscription.remove();
};

const codeOf = (error: unknown): string | undefined => {
    const code = (error as { code?: unknown } | null)?.code;
    return code === undefined || code === null ? undefined : String(code);
};

const parseValues = (raw: string): Record<string, string> | null => {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (!entries.every(([, value]) => typeof value === 'string')) return null;
        return Object.fromEntries(entries) as Record<string, string>;
    } catch {
        return null;
    }
};

export class SecureStorageService implements ISecureStorageService {
    private readonly service: string;
    private state: VaultState = { kind: 'idle' };
    private values: Record<string, string> = {};
    private resetReported = false;
    private writeFailed = false;
    private reading: Promise<void> | null = null;
    private writes: Promise<unknown> = Promise.resolve();
    private unsubscribeForeground: (() => void) | null = null;

    constructor(
        private readonly logService: ILogService,
        private readonly installFlag: ISecureStorageInstallFlag,
        bundleId: string,
        private readonly subscribeForeground: ForegroundSubscriber = defaultForegroundSubscriber
    ) {
        this.service = `${bundleId}.secrets`;
    }

    public start(): void {
        if (this.state.kind !== 'idle' || this.reading) return;
        void this.read();
        this.unsubscribeForeground ??= this.subscribeForeground(() => {
            if (this.state.kind === 'unavailable' && this.state.reason === 'locked' && !this.writeFailed) {
                void this.read();
            }
        });
    }

    public async get(): Promise<OnStorageGetPayload> {
        if (this.reading) {
            await this.reading;
        } else if (!this.writeFailed && this.state.kind !== 'available') {
            await this.read();
        }
        if (this.writeFailed) return { status: 'unavailable', reason: 'error', values: {} };
        if (this.state.kind !== 'available') {
            return {
                status: 'unavailable',
                reason: this.state.kind === 'unavailable' ? this.state.reason : 'error',
                values: {},
            };
        }
        return { status: 'available', ...(this.resetReported && { reset: true as const }), values: { ...this.values } };
    }

    public save(set: Record<string, string>, remove: readonly string[]): Promise<boolean> {
        return this.enqueue(async () => {
            await this.settleRead();
            if (this.writeFailed) return false;
            if (this.state.kind !== 'available') {
                return this.failWrite('vault not readable');
            }
            const next = { ...this.values, ...set };
            for (const key of remove) delete next[key];
            try {
                const result = await Keychain.setGenericPassword(ACCOUNT, JSON.stringify(next), this.writeOptions());
                if (result === false) return this.failWrite('keychain refused the write');
            } catch (e) {
                return this.failWrite(`keychain write failed (${codeOf(e) ?? 'no code'})`);
            }
            this.values = next;
            this.resetReported = false;
            return true;
        });
    }

    public clear(): Promise<boolean> {
        return this.enqueue(async () => {
            await this.settleRead();
            try {
                await Keychain.resetGenericPassword({ service: this.service });
            } catch (e) {
                this.logService.warn(TAG, `Clear failed (${codeOf(e) ?? 'no code'})`);
                return false;
            }
            this.values = {};
            this.resetReported = false;
            this.logService.info(TAG, 'Vault cleared');
            return true;
        });
    }

    public keyCount(): number | null {
        if (this.writeFailed || this.state.kind !== 'available') return null;
        return Object.keys(this.values).length;
    }

    private read(): Promise<void> {
        if (!this.reading) {
            this.reading = this.readOnce().finally(() => {
                this.reading = null;
            });
        }
        return this.reading;
    }

    private async readOnce(): Promise<void> {
        try {
            if (!this.installFlag.isSet()) {
                await Keychain.resetGenericPassword({ service: this.service });
                this.installFlag.set();
                this.logService.info(TAG, 'Fresh install: vault emptied');
            }
            const credentials = await Keychain.getGenericPassword({ service: this.service });
            if (!credentials) {
                this.becomeAvailable({});
                return;
            }
            const parsed = parseValues(credentials.password);
            if (!parsed) {
                await this.resetUndecryptable('stored value is not a JSON object of strings');
                return;
            }
            this.becomeAvailable(parsed);
        } catch (e) {
            const code = codeOf(e);
            if (code === IOS_LOCKED) {
                this.state = { kind: 'unavailable', reason: 'locked' };
                this.logService.info(TAG, 'Vault locked until the first unlock');
            } else if (code === ANDROID_CRYPTO_FAILED) {
                await this.resetUndecryptable(`keystore could not decrypt (${code})`);
            } else {
                this.state = { kind: 'unavailable', reason: 'error' };
                this.logService.warn(TAG, `Vault read failed (${code ?? 'no code'})`);
            }
        }
    }

    private async resetUndecryptable(why: string): Promise<void> {
        try {
            await Keychain.resetGenericPassword({ service: this.service });
        } catch (e) {
            this.state = { kind: 'unavailable', reason: 'error' };
            this.logService.warn(TAG, `Undecryptable vault could not be deleted (${codeOf(e) ?? 'no code'})`);
            return;
        }
        this.resetReported = true;
        this.becomeAvailable({});
        this.logService.warn(TAG, `Vault reset: ${why}`);
    }

    private becomeAvailable(values: Record<string, string>): void {
        this.values = values;
        this.state = { kind: 'available' };
        this.logService.info(TAG, `Vault read: ${Object.keys(values).length} keys`);
    }

    private async settleRead(): Promise<void> {
        if (this.reading) await this.reading;
        else if (this.state.kind === 'idle') await this.read();
    }

    private failWrite(why: string): false {
        this.writeFailed = true;
        this.logService.warn(TAG, `Save failed, vault unavailable for this run: ${why}`);
        return false;
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.writes.then(task);
        this.writes = run.catch(() => undefined);
        return run;
    }

    private writeOptions(): Keychain.SetOptions {
        return {
            service: this.service,
            accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
            storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
        };
    }
}
