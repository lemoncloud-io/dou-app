import type { MMKV } from 'react-native-mmkv';
import { createMMKV } from 'react-native-mmkv';

import type { ISecureStorageInstallFlag } from './types';

/** MMKV instance id. Its own file, so Android's data extraction rules can name it alone. */
export const SECURE_STORAGE_MMKV_ID = 'secure-storage';
export const SECURE_STORAGE_INSTALLED_KEY = 'secure-storage.installed';

/**
 * The install flag in its own MMKV instance rather than the shared default one: Android's data
 * extraction rules work per file, and excluding the default instance would keep every preference
 * from moving to a new phone.
 */
export class MmkvSecureStorageInstallFlag implements ISecureStorageInstallFlag {
    private readonly mmkv: MMKV;

    constructor(mmkv: MMKV = createMMKV({ id: SECURE_STORAGE_MMKV_ID })) {
        this.mmkv = mmkv;
    }

    public isSet(): boolean {
        return this.mmkv.getBoolean(SECURE_STORAGE_INSTALLED_KEY) === true;
    }

    public set(): void {
        this.mmkv.set(SECURE_STORAGE_INSTALLED_KEY, true);
    }
}
