import { app, safeStorage } from 'electron';

import { type SecureStorage, safeStorageVault } from '@chatic/storage-safe-storage';

export const createDeviceVault = (): SecureStorage =>
    safeStorageVault({ safeStorage, directory: app.getPath('userData'), platform: process.platform });
