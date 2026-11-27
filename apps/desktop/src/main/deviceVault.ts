import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app, safeStorage } from 'electron';
import { SECURE_STORAGE_FILE, SecureStorage } from './secureStorage';

export const createDeviceVault = (): SecureStorage =>
    new SecureStorage({
        safeStorage,
        fs: { readFile: path => readFile(path), writeFile, rename, rm },
        filePath: join(app.getPath('userData'), SECURE_STORAGE_FILE),
        platform: process.platform,
    });
