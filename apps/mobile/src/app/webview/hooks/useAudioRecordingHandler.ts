import type { IAppBridgeHost } from '@chatic/bridges';
import { useEffect, useMemo } from 'react';
import { AudioRecorderBridge } from '../../bridge';
import { useServices } from '../../hooks';
import { createAudioRecordingHandlers } from './audioRecordingHandlers';

export const useAudioRecordingHandler = (bridge: IAppBridgeHost) => {
    const { permissionService, logService: logger } = useServices();
    const handlers = useMemo(
        () => createAudioRecordingHandlers(bridge, AudioRecorderBridge, permissionService, logger),
        [bridge, permissionService, logger]
    );

    useEffect(() => handlers.relayEndedEvents(), [handlers]);

    return { isAvailable: AudioRecorderBridge.isAvailable, ...handlers };
};
