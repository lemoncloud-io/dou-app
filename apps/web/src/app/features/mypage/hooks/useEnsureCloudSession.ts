import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

export interface EnsureCloudSession {
    isReady: boolean;
    isSwitching: boolean;
    error: unknown;
    retry: () => void;
}

export const useEnsureCloudSession = (cloudId: string | undefined): EnsureCloudSession => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { isCloudActive } = runtime.session.useRuntimeProfile();
    const { switchCloud, isPending } = runtime.session.useSwitchCloudSession();

    const [error, setError] = useState<unknown>(null);
    const [attempt, setAttempt] = useState(0);
    const attemptedFor = useRef<string | null>(null);

    const isReady = !!cloudId && selectedCloudId === cloudId && isCloudActive;

    useEffect(() => {
        if (!cloudId || isReady || isPending || attemptedFor.current === cloudId) return;
        attemptedFor.current = cloudId;
        setError(null);
        switchCloud(cloudId).catch((e: unknown) => {
            logger.warn('CLOUD', 'cloud management could not enter the cloud', { error: e, data: { cloudId } });
            setError(e);
        });
    }, [cloudId, isReady, isPending, switchCloud, attempt]);

    const retry = useCallback(() => {
        attemptedFor.current = null;
        setError(null);
        setAttempt(n => n + 1);
    }, []);

    return {
        isReady,
        isSwitching: !isReady && !error && (isPending || !!cloudId),
        error,
        retry,
    };
};
