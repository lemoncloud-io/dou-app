import type { Logger } from '@chatic/logger';
import type { MMKV } from 'react-native-mmkv';

import {
    MmkvSecureStorageInstallFlag,
    SECURE_STORAGE_INSTALLED_KEY,
    SECURE_STORAGE_MMKV_ID,
} from './MmkvSecureStorageInstallFlag';
import { MmkvStorage } from './MmkvStorage';

const createMMKV = jest.fn();

jest.mock('react-native-mmkv', () => ({ createMMKV: (...args: unknown[]) => createMMKV(...args) }));

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

const fakeMmkv = () => {
    const values = new Map<string, string | boolean>();
    return {
        getString: jest.fn((key: string) => values.get(key) as string | undefined),
        getBoolean: jest.fn((key: string) => values.get(key) as boolean | undefined),
        set: jest.fn((key: string, value: string | boolean) => {
            values.set(key, value);
        }),
        remove: jest.fn((key: string) => values.delete(key)),
        clearAll: jest.fn(() => values.clear()),
        getAllKeys: jest.fn(() => [...values.keys()]),
    };
};

describe('MmkvStorage', () => {
    beforeEach(() => createMMKV.mockReset());

    it('opens the default MMKV instance when none is given', () => {
        createMMKV.mockReturnValue(fakeMmkv());

        new MmkvStorage(logger);

        expect(createMMKV).toHaveBeenCalledWith();
    });

    it('stores values as JSON and reads them back', async () => {
        const mmkv = fakeMmkv();
        const storage = new MmkvStorage(logger, mmkv as unknown as MMKV);

        await storage.set('pref', { theme: 'dark' });

        expect(mmkv.set).toHaveBeenCalledWith('pref', '{"theme":"dark"}');
        expect(await storage.get('pref')).toEqual({ theme: 'dark' });
        expect(storage.getByteLength('pref')).toBe('{"theme":"dark"}'.length);
        expect(storage.getAllKeys()).toEqual(['pref']);
    });

    it('returns null and logs when a stored value is not JSON', () => {
        const mmkv = fakeMmkv();
        mmkv.set('broken', '{');
        const storage = new MmkvStorage(logger, mmkv as unknown as MMKV);

        expect(storage.getSync('broken')).toBeNull();
        expect(logger.error).toHaveBeenCalledWith('STORAGE', 'JSON Parsing Error for key: broken', expect.any(Error));
    });
});

describe('MmkvSecureStorageInstallFlag', () => {
    beforeEach(() => createMMKV.mockReset());

    it('keeps the flag in the secure-storage MMKV file', () => {
        const mmkv = fakeMmkv();
        createMMKV.mockReturnValue(mmkv);
        const flag = new MmkvSecureStorageInstallFlag();

        expect(createMMKV).toHaveBeenCalledWith({ id: SECURE_STORAGE_MMKV_ID });
        expect(SECURE_STORAGE_MMKV_ID).toBe('secure-storage');
        expect(flag.isSet()).toBe(false);

        flag.set();

        expect(mmkv.set).toHaveBeenCalledWith(SECURE_STORAGE_INSTALLED_KEY, true);
        expect(SECURE_STORAGE_INSTALLED_KEY).toBe('secure-storage.installed');
        expect(flag.isSet()).toBe(true);
    });
});
