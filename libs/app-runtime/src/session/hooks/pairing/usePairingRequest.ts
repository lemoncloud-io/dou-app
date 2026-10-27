import { useCallback, useEffect, useRef, useState } from 'react';

import { useRuntimeRepositories } from '../../../data/hooks/useRuntimeRepositories';
import { applySessionToken } from '../../../socket/auth/applySessionToken';
import { useDynamicDeviceId } from '../app/useDynamicDeviceId';
import { useSwitchCloudSession } from '../session/actions/useSwitchCloudSession';
import { pairedClouds } from '../../pairing/pairedClouds';
import { pairingClientOf } from '../../pairing/pairingClient';
import {
    createPairingRequestFlow,
    type PairingRequestFlow,
    type PairingRequestState,
} from '../../pairing/pairingRequestFlow';

export interface PairingRequestOptions {
    /**
     * Runs before the first request. A request is only accepted from a guest session, and a desktop
     * browser's start screen has none yet — it signs in as a guest here.
     */
    ensureGuestSession?: () => Promise<void>;
}

/**
 * The code screen's half of a pairing: asks for a code, polls the relay until the approving device
 * answers, and signs this device in — a relay approval through the same path as a phone login, a cloud
 * approval by entering that cloud as a guest and remembering it as a paired cloud.
 *
 * The flow is built once per mount and survives strict mode's unmount/remount without sending a second
 * request or overlapping claims (see `createPairingRequestFlow`).
 */
export const usePairingRequest = (options: PairingRequestOptions = {}) => {
    const { pairing } = useRuntimeRepositories();
    const { deviceId } = useDynamicDeviceId();
    const { switchCloud } = useSwitchCloudSession();
    const [state, setState] = useState<PairingRequestState>({ phase: 'requesting' });

    // The flow outlives renders; it reads the latest values through this ref.
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
            claim: pairingId => latest.current.pairing.claimPairing(pairingId),
            applySession: session => applySessionToken(session),
            enterCloud: async cloudId => {
                await latest.current.switchCloud(cloudId);
                pairedClouds.add(cloudId);
            },
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
