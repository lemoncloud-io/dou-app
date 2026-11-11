import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import type { OnStorageGetPayload } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import type { ForegroundSubscriber, ISecureStorageInstallFlag, ISecureStorageService, VaultState } from './types';

const TAG = 'SECURE_STORAGE';

/** The keychain item's account name. Fixed; only the password carries data. */
const ACCOUNT = 'vault';

/**
 * iOS `errSecInteractionNotAllowed`: the keychain is still locked because the phone has not been
 * unlocked since it booted. The module rejects with the OSStatus as the code.
 */
const IOS_LOCKED = '-25308';

/**
 * Android: the Keystore could not decrypt the item — its key was invalidated (lock screen removed,
 * biometrics changed) or the ciphertext came from another device's key.
 */
const ANDROID_CRYPTO_FAILED = 'E_CRYPTO_FAILED';

const defaultForegroundSubscriber: ForegroundSubscriber = onForeground => {
    const subscription = AppState.addEventListener('change', next => {
        if (next === 'active') onForeground();
    });
    return () => subscription.remove();
};

/** The rejection code a native module attached, if any. */
const codeOf = (error: unknown): string | undefined => {
    const code = (error as { code?: unknown } | null)?.code;
    return code === undefined || code === null ? undefined : String(code);
};

/** The stored JSON, or `null` when it is not an object of strings — which counts as undecryptable. */
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

/**
 * The `nativeSecure` medium on the phone: one keychain item named `<bundle id>.secrets`, holding every
 * key as one JSON object, readable after the first unlock and never leaving this device.
 *
 * A read failure is never taken for an empty vault — the web would read "signed out" and the next
 * save would overwrite what is actually there. The single exception is an item that cannot be
 * decrypted: nothing can ever read it again, so it is deleted and the web is told (`reset`).
 *
 * Values never reach a log line; only counts and error codes do.
 */
export class SecureStorageService implements ISecureStorageService {
    private readonly service: string;
    private state: VaultState = { kind: 'idle' };
    private values: Record<string, string> = {};
    /** Reported with every StorageGet until the web writes into the emptied vault. */
    private resetReported = false;
    /** A write failed: the vault in the keychain and the copy here may differ, so stop using it. */
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
            // Only a locked vault can change by being unlocked; an error waits for the next StorageGet.
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
                // Writing the whole object over a vault that could not be read would drop what it holds.
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

    /** One read at a time: a StorageGet during the start read joins it instead of starting another. */
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
                // A fresh install. iOS keeps keychain items across an uninstall, so an item here
                // belongs to the previous install and must not sign this one in.
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

    /** A write that arrives before the start read finished waits for it, so it lands on what was read. */
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
        // `writes` never rejects (see the catch below), so each task starts after the previous one
        // settled, whatever its outcome.
        const run = this.writes.then(task);
        this.writes = run.catch(() => undefined);
        return run;
    }

    private writeOptions(): Keychain.SetOptions {
        return {
            service: this.service,
            accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
            // No user authentication: the web reads the vault at every launch without a prompt.
            storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
        };
    }
}
