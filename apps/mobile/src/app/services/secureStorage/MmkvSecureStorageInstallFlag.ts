import type { MMKV } from 'react-native-mmkv';
import { createMMKV } from 'react-native-mmkv';

import type { ISecureStorageInstallFlag } from './types';

export const SECURE_STORAGE_MMKV_ID = 'secure-storage';
export const SECURE_STORAGE_INSTALLED_KEY = 'secure-storage.installed';

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
