import type { WebMessageData } from '@chatic/bridge-messages';

import type { ILogService } from '../../services/log';
import type { ISecureStorageService } from '../../services/secureStorage';
import { createSecureStorageHandlers } from './secureStorageHandlers';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

const createVault = () =>
    ({
        start: jest.fn(),
        get: jest.fn(async () => ({ status: 'available' as const, values: { token: 'a' } })),
        save: jest.fn(async () => true),
        clear: jest.fn(async () => true),
        keyCount: jest.fn(() => 1),
    }) as unknown as jest.Mocked<ISecureStorageService>;

const request = <K extends 'StorageGet' | 'StorageSave' | 'StorageClear'>(type: K, data: unknown) =>
    ({ type, data }) as unknown as WebMessageData<K>;

describe('createSecureStorageHandlers', () => {
    it('answers StorageGet with the vault', async () => {
        const vault = createVault();
        const { handleStorageGet } = createSecureStorageHandlers(vault, logger);

        await expect(handleStorageGet(request('StorageGet', { medium: 'nativeSecure' }))).resolves.toEqual({
            type: 'OnStorageGet',
            success: true,
            data: { status: 'available', values: { token: 'a' } },
        });
    });

    it('passes the writes of StorageSave through and answers ok', async () => {
        const vault = createVault();
        const { handleStorageSave } = createSecureStorageHandlers(vault, logger);

        const reply = await handleStorageSave(
            request('StorageSave', { medium: 'nativeSecure', set: { token: 'b' }, remove: ['old'] })
        );

        expect(vault.save).toHaveBeenCalledWith({ token: 'b' }, ['old']);
        expect(reply).toEqual({ type: 'OnStorageSave', success: true, data: { ok: true } });
    });

    it('answers a failed save as ok: false, not as a bridge error', async () => {
        const vault = createVault();
        vault.save.mockResolvedValue(false);
        const { handleStorageSave } = createSecureStorageHandlers(vault, logger);

        const reply = await handleStorageSave(request('StorageSave', { medium: 'nativeSecure', set: {}, remove: [] }));

        expect(reply).toEqual({ type: 'OnStorageSave', success: true, data: { ok: false } });
    });

    it('answers StorageClear with the outcome of the clear', async () => {
        const vault = createVault();
        const { handleStorageClear } = createSecureStorageHandlers(vault, logger);

        await expect(handleStorageClear(request('StorageClear', { medium: 'nativeSecure' }))).resolves.toEqual({
            type: 'OnStorageClear',
            success: true,
            data: { ok: true },
        });
    });

    it.each([
        ['StorageGet', { medium: 'localStorage' }],
        ['StorageSave', { medium: 'electronSafe', set: {}, remove: [] }],
        ['StorageClear', {}],
    ] as const)('rejects %s for a medium this shell does not keep', async (type, data) => {
        const vault = createVault();
        const handlers = createSecureStorageHandlers(vault, logger);
        const handle = {
            StorageGet: handlers.handleStorageGet,
            StorageSave: handlers.handleStorageSave,
            StorageClear: handlers.handleStorageClear,
        }[type] as (message: unknown) => Promise<unknown>;

        const reply = await handle(request(type, data));

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
        );
        expect(vault.get).not.toHaveBeenCalled();
        expect(vault.save).not.toHaveBeenCalled();
        expect(vault.clear).not.toHaveBeenCalled();
    });

    it.each([
        [{ medium: 'nativeSecure', set: { token: 1 }, remove: [] }],
        [{ medium: 'nativeSecure', set: {}, remove: 'token' }],
        [{ medium: 'nativeSecure', remove: [] }],
    ])('rejects a malformed StorageSave without writing', async data => {
        const vault = createVault();
        const { handleStorageSave } = createSecureStorageHandlers(vault, logger);

        const reply = await handleStorageSave(request('StorageSave', data));

        expect(reply).toEqual(expect.objectContaining({ type: 'OnStorageSave', success: false }));
        expect(vault.save).not.toHaveBeenCalled();
    });
});
