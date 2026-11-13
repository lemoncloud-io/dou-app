import { useCallback, useEffect, useRef, useState } from 'react';

import { useRuntimeRepositories } from '../../../data/hooks/useRuntimeRepositories';
import { pairingClientOf, PairingRequestFlow } from '@chatic/auth';
import type { PairingRequestState } from '@chatic/auth';
import { sessionCommands } from '../../sessionCommands';
import { useDynamicDeviceId } from '../app/useDynamicDeviceId';
import { useSwitchCloudSession } from '../session/actions/useSwitchCloudSession';

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
 * approval by entering that cloud as a guest and remembering it as a paired cloud. The claim and the
 * sign-in are the engine's commands: a relay approval carries the account's session token, which the
 * runtime keeps and this flow only names by a handle.
 *
 * The flow is built once per mount and survives strict mode's unmount/remount without sending a second
 * request or overlapping claims (see `PairingRequestFlow`).
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
        flowRef.current = new PairingRequestFlow({
            request: async () => {
                const { ensureGuestSession } = latest.current.options;
                if (ensureGuestSession) await ensureGuestSession();
                return latest.current.pairing.requestPairing({
                    purpose: 'web',
                    deviceId: latest.current.deviceId,
                    client: pairingClientOf(),
                });
            },
            claim: pairingId => sessionCommands().claimPairing(pairingId),
            applySession: sessionHandle => sessionCommands().applyPairingSession(sessionHandle),
            // Prepared by the runtime, switched by this screen's own switch — which carries the switch's
            // trace and its in-flight key.
            enterCloud: async cloudId => {
                await sessionCommands().preparePairedCloudEntry(cloudId);
                await latest.current.switchCloud(cloudId);
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
