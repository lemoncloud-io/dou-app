import { useCallback, useEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';

import { runtime } from '@chatic/runtime-react';

import { useAppVisibility } from '../bridge';
import { ROUTES } from '../routes/paths';

type PresenceStatus = 'green' | 'yellow';

const toStatus = (isForeground: boolean): PresenceStatus => (isForeground ? 'green' : 'yellow');

export const useDeviceSync = (): void => {
    const roomMatch = useMatch(ROUTES.channels.room(':channelId'));
    const threadMatch = useMatch(ROUTES.channels.thread(':channelId', ':rootNo'));
    const channelId = roomMatch?.params.channelId ?? threadMatch?.params.channelId ?? '';
    const { device } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const lastNotifiedRef = useRef<string | null>(null);

    const statusRef = useRef<PresenceStatus>(document.visibilityState === 'hidden' ? 'yellow' : 'green');
    const lastSentStatusRef = useRef<PresenceStatus | null>(null);
    const isForegroundRef = useRef(document.visibilityState !== 'hidden');

    const syncViewing = useCallback((): void => {
        if (!isVerified) return;
        const viewingId = isForegroundRef.current ? channelId : '';
        if (lastNotifiedRef.current === viewingId) return;
        if (lastNotifiedRef.current === null && viewingId === '') {
            lastNotifiedRef.current = '';
            return;
        }
        lastNotifiedRef.current = viewingId;
        device.syncDevice(viewingId ? 'channel' : '', viewingId);
    }, [device, isVerified, channelId]);

    useAppVisibility(isForeground => {
        const status = toStatus(isForeground);
        statusRef.current = status;
        isForegroundRef.current = isForeground;

        if (!isVerified) return;

        if (lastSentStatusRef.current !== status) {
            lastSentStatusRef.current = status;
            device.syncStatus(status);
        }

        syncViewing();
    });

    useEffect(() => {
        if (!isVerified) {
            lastNotifiedRef.current = null;
            lastSentStatusRef.current = null;
            return;
        }

        if (lastSentStatusRef.current !== statusRef.current) {
            lastSentStatusRef.current = statusRef.current;
            device.syncStatus(statusRef.current);
        }

        syncViewing();
    }, [device, isVerified, syncViewing]);
};
