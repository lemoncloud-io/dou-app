import { PairingRequestFlow } from '@chatic/auth';
import type { PairingRequestFlowDeps } from '@chatic/auth';

import { sessionCommands } from './sessionCommands';
import { readSession } from './sessionReads';

export const createPairedCloudCheck = (onEnded: (cloudId: string) => void): (() => Promise<void>) => {
    let running = false;
    return async () => {
        if (running || readSession().pairing.cloudIds.length === 0) return;
        running = true;
        try {
            (await sessionCommands().checkPairedClouds()).forEach(cloudId => onEnded(cloudId));
        } finally {
            running = false;
        }
    };
};

export type PairingRequestScreen = Pick<PairingRequestFlowDeps, 'request' | 'onChange'> & {
    switchCloud: (cloudId: string) => Promise<unknown>;
};

export const createPairingRequestFlow = ({
    request,
    onChange,
    switchCloud,
}: PairingRequestScreen): PairingRequestFlow =>
    new PairingRequestFlow({
        request,
        claim: pairingId => sessionCommands().claimPairing(pairingId),
        applySession: sessionHandle => sessionCommands().applyPairingSession(sessionHandle),
        enterCloud: async cloudId => {
            await sessionCommands().preparePairedCloudEntry(cloudId);
            await switchCloud(cloudId);
        },
        onChange,
    });
