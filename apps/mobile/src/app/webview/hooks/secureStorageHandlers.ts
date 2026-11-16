import type { WebMessageData, WebMessageHandlerResponse } from '@chatic/bridge-messages';

import { invalid, isKeptMedium, isStringArray, isStringRecord } from '../utils/storageRequest.util';

import type { ILogService } from '../../services/log';
import type { ISecureStorageService } from '../../services/secureStorage';

/**
 * Relays StorageGet / StorageSave / StorageClear to the device vault. Main WebView only: these are
 * never registered on the sub WebView's host, and the main host already drops messages from an
 * untrusted origin.
 *
 * A vault that cannot be used is a normal answer (`status: 'unavailable'`, `ok: false`), not a bridge
 * error; only a malformed request is answered with `INVALID`.
 *
 * Once the app's own runtime holds the session (`ownsSession`), the vault is that runtime's: everything
 * in it is the session's tokens, and the page reaches the session through the runtime without ever
 * holding one. So the page is answered as it is by a vault it cannot use — `unavailable`, `ok: false` —
 * and nothing it sends reads, overwrites or empties the session. Off until the app runs the session.
 */
export const createSecureStorageHandlers = (
    vault: ISecureStorageService,
    logger: ILogService,
    { ownsSession = () => false }: { ownsSession?: () => boolean } = {}
) => {
    // Once per kind of message: a page that cannot use the vault asks again on every return to the front.
    const reported = new Set<string>();
    const refused = (type: string) => {
        if (reported.has(type)) return;
        reported.add(type);
        logger.warn('SECURE_STORAGE', `${type} refused: the app's runtime holds the session`);
    };

    const handleStorageGet = async (
        message: WebMessageData<'StorageGet'>
    ): Promise<WebMessageHandlerResponse<'StorageGet'>> => {
        const { medium } = (message.data ?? {}) as Partial<WebMessageData<'StorageGet'>['data']>;
        if (!isKeptMedium(medium)) return invalid('OnStorageGet', 'medium must be nativeSecure');
        if (ownsSession()) {
            refused('StorageGet');
            return {
                type: 'OnStorageGet' as const,
                success: true,
                data: { status: 'unavailable', reason: 'error', values: {} },
            };
        }
        const data = await vault.get();
        return { type: 'OnStorageGet' as const, success: true, data };
    };

    const handleStorageSave = async (
        message: WebMessageData<'StorageSave'>
    ): Promise<WebMessageHandlerResponse<'StorageSave'>> => {
        const { medium, set, remove } = (message.data ?? {}) as Partial<WebMessageData<'StorageSave'>['data']>;
        if (!isKeptMedium(medium)) return invalid('OnStorageSave', 'medium must be nativeSecure');
        if (!isStringRecord(set) || !isStringArray(remove)) {
            return invalid('OnStorageSave', 'set must map keys to strings and remove must list keys');
        }
        if (ownsSession()) {
            refused('StorageSave');
            return { type: 'OnStorageSave' as const, success: true, data: { ok: false } };
        }
        const ok = await vault.save(set, remove);
        if (!ok) logger.warn('SECURE_STORAGE', 'StorageSave answered ok: false');
        return { type: 'OnStorageSave' as const, success: true, data: { ok } };
    };

    const handleStorageClear = async (
        message: WebMessageData<'StorageClear'>
    ): Promise<WebMessageHandlerResponse<'StorageClear'>> => {
        const { medium } = (message.data ?? {}) as Partial<WebMessageData<'StorageClear'>['data']>;
        if (!isKeptMedium(medium)) return invalid('OnStorageClear', 'medium must be nativeSecure');
        if (ownsSession()) {
            refused('StorageClear');
            return { type: 'OnStorageClear' as const, success: true, data: { ok: false } };
        }
        const ok = await vault.clear();
        return { type: 'OnStorageClear' as const, success: true, data: { ok } };
    };

    return { handleStorageGet, handleStorageSave, handleStorageClear };
};
