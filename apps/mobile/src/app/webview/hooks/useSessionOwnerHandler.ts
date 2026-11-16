import { useEffect } from 'react';
import Config from 'react-native-config';

import type { WebMessageData } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

import { appRestart } from '../../services/appRestart';
import { launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import { openSessionOwnerFile } from '../../services/runtime/runtimeStorageFiles';
import { createSessionOwnerSwitch, isSessionOwnerSwitchAllowed } from '../../services/runtime/sessionOwnerSwitch';

const isOwner = (value: unknown): value is 'web' | 'native' => value === 'web' || value === 'native';

/**
 * Answers the debug overlay's session owner switch (`FetchSessionOwner`, `SetSessionOwner`) in a build
 * for any stage but production. A production build registers nothing: both requests answer
 * `NOT_FOUND`, and the overlay shows no switch.
 */
export const useSessionOwnerHandler = (bridge: IAppBridgeHost): void => {
    useEffect(() => {
        if (!isSessionOwnerSwitchAllowed(Config.VITE_ENV)) return undefined;
        const ownerSwitch = createSessionOwnerSwitch({
            current: launchSessionOwner,
            file: openSessionOwnerFile,
            restart: appRestart,
        });

        bridge.registerHandler('FetchSessionOwner', async () => ({
            type: 'OnFetchSessionOwner' as const,
            success: true,
            data: ownerSwitch.read(),
        }));
        bridge.registerHandler('SetSessionOwner', async (message: WebMessageData<'SetSessionOwner'>) => {
            const owner = message.data?.owner;
            if (!isOwner(owner)) {
                return {
                    type: 'OnSetSessionOwner' as const,
                    success: false,
                    error: { code: 'INVALID_OWNER', message: `Unknown session owner: ${String(owner)}` },
                };
            }
            return { type: 'OnSetSessionOwner' as const, success: true, data: ownerSwitch.set(owner) };
        });
        return () => {
            bridge.unregisterHandler('FetchSessionOwner');
            bridge.unregisterHandler('SetSessionOwner');
        };
    }, [bridge]);
};
