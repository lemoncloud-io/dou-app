import { useMemo } from 'react';

import type * as RuntimeMobileModule from '@chatic/runtime-mobile';

import { logger, secureStorageService } from '../../services';
import { launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import type * as NativeRuntimeModule from '../../services/runtime/nativeRuntime';
import { openRuntimeStorageFiles } from '../../services/runtime/runtimeStorageFiles';
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
 * Tells the runtime's boot whether the page's vault clear was confirmed, in the runtime's own plain file,
 * where its boot looks for an unfinished logout. Opened only when a page clears the vault, and the runtime's
 * module with it: nothing on the app's startup path loads the runtime.
 */
const recordClearForRuntime = (ok: boolean): void => {
    const { keyValueStoreOn, setSecretLogoutPending } = require('@chatic/runtime-mobile') as typeof RuntimeMobileModule;
    setSecretLogoutPending(keyValueStoreOn(openRuntimeStorageFiles().plain), !ok);
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
