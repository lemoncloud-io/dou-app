import { useMemo } from 'react';

import { logger, secureStorageService } from '../../services';
import { launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import type * as NativeRuntimeModule from '../../services/runtime/nativeRuntime';
import { createSecureStorageHandlers } from './secureStorageHandlers';

/**
 * Whether the app's runtime holds the session now: a launch it owns, once it has started. Loads the
 * runtime's module only on such a launch.
 */
const runtimeOwnsSession = (): boolean => {
    if (launchSessionOwner() !== 'native') return false;
    const { nativeRuntimeHost } = require('../../services/runtime/nativeRuntime') as typeof NativeRuntimeModule;
    return nativeRuntimeHost.engine() !== null;
};

/** The device vault's bridge handlers (`StorageGet`, `StorageSave`, `StorageClear`). */
export const useSecureStorageHandler = () =>
    useMemo(() => createSecureStorageHandlers(secureStorageService, logger, { ownsSession: runtimeOwnsSession }), []);
