import { useMemo } from 'react';

import { logger, secureStorageService } from '../../services';
import { launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import type * as NativeRuntimeModule from '../../services/runtime/nativeRuntime';
import type * as RuntimeLogoutMarkerModule from '../../services/runtime/runtimeLogoutMarker';
import { createSecureStorageHandlers } from './secureStorageHandlers';

const runtimeOwnsSession = (): boolean => {
    if (launchSessionOwner() !== 'native') return false;
    const { nativeRuntimeHost } = require('../../services/runtime/nativeRuntime') as typeof NativeRuntimeModule;
    return nativeRuntimeHost.engine() !== null;
};

const recordClearForRuntime = (ok: boolean): void => {
    const { recordPageVaultClear } =
        require('../../services/runtime/runtimeLogoutMarker') as typeof RuntimeLogoutMarkerModule;
    recordPageVaultClear(ok);
};

export const useSecureStorageHandler = () =>
    useMemo(
        () =>
            createSecureStorageHandlers(secureStorageService, logger, {
                ownsSession: runtimeOwnsSession,
                onClearResult: recordClearForRuntime,
            }),
        []
    );
