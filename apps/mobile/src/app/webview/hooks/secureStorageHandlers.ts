import type { WebMessageData, WebMessageHandlerResponse } from '@chatic/bridge-messages';

import { invalid, isKeptMedium, isStringArray, isStringRecord } from '../utils/storageRequest.util';

import type { ILogService } from '../../services/log';
import type { ISecureStorageService } from '../../services/secureStorage';

export const createSecureStorageHandlers = (
    vault: ISecureStorageService,
    logger: ILogService,
    {
        ownsSession = () => false,
        onClearResult = () => undefined,
    }: { ownsSession?: () => boolean; onClearResult?: (ok: boolean) => void } = {}
) => {
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
        try {
            onClearResult(ok);
        } catch (error) {
            logger.warn('SECURE_STORAGE', 'Could not record the clear for the runtime', { error });
        }
        return { type: 'OnStorageClear' as const, success: true, data: { ok } };
    };

    return { handleStorageGet, handleStorageSave, handleStorageClear };
};
