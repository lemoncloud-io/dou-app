import { useMemo } from 'react';

import { logger, secureStorageService } from '../../services';
import { createSecureStorageHandlers } from './secureStorageHandlers';

/** The device vault's bridge handlers (`StorageGet`, `StorageSave`, `StorageClear`). */
export const useSecureStorageHandler = () =>
    useMemo(() => createSecureStorageHandlers(secureStorageService, logger), []);
