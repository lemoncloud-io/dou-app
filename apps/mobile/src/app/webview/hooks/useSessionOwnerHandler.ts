import { useEffect } from 'react';
import Config from 'react-native-config';

import type { IAppBridgeHost } from '@chatic/bridges';

import { appRestart } from '../../services/appRestart';
import { buildDefaultSessionOwner, launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import { openSessionOwnerFile } from '../../services/runtime/runtimeStorageFiles';
import { createSessionOwnerSwitch, isSessionOwnerSwitchAllowed } from '../../services/runtime/sessionOwnerSwitch';
import { useDebugSettingsStore } from '../../stores/debugSettingsStore';
import { createSessionOwnerHandlers } from './sessionOwnerHandlers';

/**
 * Answers the debug overlay's session owner switch (`FetchSessionOwner`, `SetSessionOwner`): always in
 * a build for any stage but production, and in a production build only while the app's debug mode is
 * on. Debug mode gates changing the owner, not keeping it: a production install moved onto the app's
 * runtime stays there until someone unlocks debug mode again and moves it back, or the app is removed.
 */
export const useSessionOwnerHandler = (bridge: IAppBridgeHost): void => {
    useEffect(() => {
        const { handleFetchSessionOwner, handleSetSessionOwner } = createSessionOwnerHandlers({
            ownerSwitch: createSessionOwnerSwitch({
                current: launchSessionOwner,
                file: openSessionOwnerFile,
                fallback: buildDefaultSessionOwner,
                restart: appRestart,
            }),
            allowed: () =>
                isSessionOwnerSwitchAllowed(Config.VITE_ENV, useDebugSettingsStore.getState().debugModeEnabled),
        });
        bridge.registerHandler('FetchSessionOwner', handleFetchSessionOwner);
        bridge.registerHandler('SetSessionOwner', handleSetSessionOwner);
        return () => {
            bridge.unregisterHandler('FetchSessionOwner');
            bridge.unregisterHandler('SetSessionOwner');
        };
    }, [bridge]);
};
