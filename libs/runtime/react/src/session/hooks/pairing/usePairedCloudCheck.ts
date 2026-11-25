import { useCallback, useEffect, useRef, useState } from 'react';

import { createPairedCloudCheck, PAIRED_CLOUD_CHECK_INTERVAL_MS } from '@chatic/runtime-client';

import { useSessionAuth } from '../session/readers/useSessionAuth';

export const usePairedCloudCheck = (onEnded: (cloudId: string) => void): { check: () => Promise<void> } => {
    const latest = useRef(onEnded);
    latest.current = onEnded;
    const [runCheck] = useState(() => createPairedCloudCheck(cloudId => latest.current(cloudId)));
    const { isInitialized } = useSessionAuth();
    const ready = useRef(isInitialized);
    ready.current = isInitialized;

    const check = useCallback(async () => {
        if (!ready.current) return;
        await runCheck();
    }, [runCheck]);

    useEffect(() => {
        if (!isInitialized) return;
        void check();
        const timer = setInterval(() => void check(), PAIRED_CLOUD_CHECK_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [check, isInitialized]);

    return { check };
};
