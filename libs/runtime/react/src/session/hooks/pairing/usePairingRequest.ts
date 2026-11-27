import { useCallback, useEffect, useRef, useState } from 'react';

import { createPairingRequestFlow } from '@chatic/runtime-client';
import type { PairingRequestFlow, PairingRequestState } from '@chatic/runtime-client';

import { useRuntimeRepositories } from '../../../data/hooks/useRuntimeRepositories';
import { pairingClientOf } from '@chatic/runtime/api/session';
import { useDynamicDeviceId } from '../app/useDynamicDeviceId';
import { useSwitchCloudSession } from '../session/actions/useSwitchCloudSession';

export interface PairingRequestOptions {
    ensureGuestSession?: () => Promise<void>;
}

export const usePairingRequest = (options: PairingRequestOptions = {}) => {
    const { pairing } = useRuntimeRepositories();
    const { deviceId } = useDynamicDeviceId();
    const { switchCloud } = useSwitchCloudSession();
    const [state, setState] = useState<PairingRequestState>({ phase: 'requesting' });

    const latest = useRef({ pairing, deviceId, switchCloud, options });
    latest.current = { pairing, deviceId, switchCloud, options };

    const flowRef = useRef<PairingRequestFlow | null>(null);
    if (!flowRef.current) {
        flowRef.current = createPairingRequestFlow({
            request: async () => {
                const { ensureGuestSession } = latest.current.options;
                if (ensureGuestSession) await ensureGuestSession();
                return latest.current.pairing.requestPairing({
                    purpose: 'web',
                    deviceId: latest.current.deviceId,
                    client: pairingClientOf(),
                });
            },
            switchCloud: cloudId => latest.current.switchCloud(cloudId),
            onChange: setState,
        });
    }

    useEffect(() => {
        const flow = flowRef.current;
        flow?.start();
        return () => flow?.stop();
    }, []);

    const restart = useCallback(() => flowRef.current?.restart(), []);
    return { state, restart };
};
