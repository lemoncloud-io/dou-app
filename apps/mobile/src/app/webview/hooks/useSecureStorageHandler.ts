import { useMemo } from 'react';

import { logger, secureStorageService } from '../../services';
import { launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import type * as NativeRuntimeModule from '../../services/runtime/nativeRuntime';
import type * as RuntimeLogoutMarkerModule from '../../services/runtime/runtimeLogoutMarker';
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

/**
 * Tells the runtime's boot whether the page's vault clear was confirmed (`recordPageVaultClear`). Loaded
 * only when a page clears the vault: nothing on the app's startup path loads the runtime's library.
 */
const recordClearForRuntime = (ok: boolean): void => {
    const { recordPageVaultClear } =
        require('../../services/runtime/runtimeLogoutMarker') as typeof RuntimeLogoutMarkerModule;
    recordPageVaultClear(ok);
};

/** The device vault's bridge handlers (`StorageGet`, `StorageSave`, `StorageClear`). */
export const useSecureStorageHandler = () =>
    useMemo(
        () =>
            createSecureStorageHandlers(secureStorageService, logger, {
                ownsSession: runtimeOwnsSession,
                onClearResult: recordClearForRuntime,
            }),
        []
    );
