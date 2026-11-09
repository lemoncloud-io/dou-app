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
 */
export const createSecureStorageHandlers = (vault: ISecureStorageService, logger: ILogService) => {
    const handleStorageGet = async (
        message: WebMessageData<'StorageGet'>
    ): Promise<WebMessageHandlerResponse<'StorageGet'>> => {
        const { medium } = (message.data ?? {}) as Partial<WebMessageData<'StorageGet'>['data']>;
        if (!isKeptMedium(medium)) return invalid('OnStorageGet', 'medium must be nativeSecure');
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
        const ok = await vault.save(set, remove);
        if (!ok) logger.warn('SECURE_STORAGE', 'StorageSave answered ok: false');
        return { type: 'OnStorageSave' as const, success: true, data: { ok } };
    };

    const handleStorageClear = async (
        message: WebMessageData<'StorageClear'>
    ): Promise<WebMessageHandlerResponse<'StorageClear'>> => {
        const { medium } = (message.data ?? {}) as Partial<WebMessageData<'StorageClear'>['data']>;
        if (!isKeptMedium(medium)) return invalid('OnStorageClear', 'medium must be nativeSecure');
        const ok = await vault.clear();
        return { type: 'OnStorageClear' as const, success: true, data: { ok } };
    };

    return { handleStorageGet, handleStorageSave, handleStorageClear };
};
