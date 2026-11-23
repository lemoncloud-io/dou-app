import { useEffect } from 'react';
import Config from 'react-native-config';

import type { IAppBridgeHost } from '@chatic/bridges';

import { appRestart } from '../../services/appRestart';
import { launchSessionOwner, unswitchedSessionOwner } from '../../services/runtime/launchSessionOwner';
import { openSessionOwnerFile } from '../../services/runtime/runtimeStorageFiles';
import { readSessionOwner } from '../../services/runtime/sessionOwner';
import { createSessionOwnerSwitch, isSessionOwnerSwitchAllowed } from '../../services/runtime/sessionOwnerSwitch';
import { useDebugSettingsStore } from '../../stores/debugSettingsStore';
import { createDefaultSessionOwnerHandler, createSessionOwnerHandlers } from './sessionOwnerHandlers';

export const useSessionOwnerHandler = (bridge: IAppBridgeHost): void => {
    useEffect(() => {
        const { handleFetchSessionOwner, handleSetSessionOwner } = createSessionOwnerHandlers({
            ownerSwitch: createSessionOwnerSwitch({
                current: launchSessionOwner,
                file: openSessionOwnerFile,
                fallback: () => unswitchedSessionOwner(openSessionOwnerFile()),
                restart: appRestart,
            }),
            allowed: () =>
                isSessionOwnerSwitchAllowed(Config.VITE_ENV, useDebugSettingsStore.getState().debugModeEnabled),
        });
        const { handleSetDefaultSessionOwner } = createDefaultSessionOwnerHandler({
            file: openSessionOwnerFile,
            next: file => readSessionOwner(file, unswitchedSessionOwner(file)),
        });
        bridge.registerHandler('FetchSessionOwner', handleFetchSessionOwner);
        bridge.registerHandler('SetSessionOwner', handleSetSessionOwner);
        bridge.registerHandler('SetDefaultSessionOwner', handleSetDefaultSessionOwner);
        return () => {
            bridge.unregisterHandler('FetchSessionOwner');
            bridge.unregisterHandler('SetSessionOwner');
            bridge.unregisterHandler('SetDefaultSessionOwner');
        };
    }, [bridge]);
};
