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

/**
 * Answers the debug overlay's session owner switch (`FetchSessionOwner`, `SetSessionOwner`): always in
 * a build for any stage but production, and in a production build only while the app's debug mode is
 * on. Debug mode gates changing the owner, not keeping it: a production install moved onto the app's
 * runtime stays there until someone unlocks debug mode again and moves it back, or the app is removed.
 *
 * Also answers the page's default owner (`SetDefaultSessionOwner`) on every build, with no gate: the page
 * sends what its web build names on each boot, for installs nobody switched.
 */
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
