import { useRef } from 'react';

import { runtime } from '@chatic/runtime-react';

import { useAppForeground } from '../bridge';

const KICK_THROTTLE_MS = 5_000;

export const useSocketWakeRecovery = (): void => {
    const lastKickRef = useRef(0);

    useAppForeground(() => {
        const now = Date.now();
        if (now - lastKickRef.current < KICK_THROTTLE_MS) return;
        lastKickRef.current = now;
        void runtime.connection.recoverSocketsOnResume();
        runtime.sync.refreshBackgroundClouds();
    });
};
