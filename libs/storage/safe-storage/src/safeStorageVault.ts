import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SECURE_STORAGE_FILE } from './constants';
import { SecureStorage } from './secureStorage';
import type { SafeStorageLike } from './types';

export interface SafeStorageVaultOptions {
    safeStorage: SafeStorageLike;
    directory: string;
    platform: string;
}

export const safeStorageVault = ({ safeStorage, directory, platform }: SafeStorageVaultOptions): SecureStorage =>
    new SecureStorage({
        safeStorage,
        fs: { readFile: path => readFile(path), writeFile, rename, rm },
        filePath: join(directory, SECURE_STORAGE_FILE),
        platform,
    });
