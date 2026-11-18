import { PairingRequestFlow } from '@chatic/auth';
import type { PairingRequestFlowDeps } from '@chatic/auth';

import { sessionCommands } from './sessionCommands';
import { readSession } from './sessionReads';

/**
 * A paired-cloud check: re-checks the clouds a pairing let this device into, and hands `onEnded` each
 * cloud the relay stopped delegating — already torn down and off the list. With no paired cloud it
 * does nothing at all, and a call while the last one still runs is dropped rather than queued. A
 * device that has since signed in to an account of its own drops its guest list instead (the engine's
 * `checkPairedClouds`).
 *
 * When to run it — after the session has initialised, on an interval, on returning to the foreground —
 * is the caller's: those are signals only a mounted screen sees.
 */
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

/** What the screen running a pairing request supplies — the rest is the engine's. */
export type PairingRequestScreen = Pick<PairingRequestFlowDeps, 'request' | 'onChange'> & {
    /** The screen's own cloud switch, which carries the switch's trace and its in-flight key. */
    switchCloud: (cloudId: string) => Promise<unknown>;
};

/**
 * The code screen's half of a pairing, wired to the engine: the claim and the sign-in are the
 * engine's commands — a relay approval carries the account's session token, which the runtime keeps
 * and this flow only names by a handle — and a cloud approval is prepared by the runtime, then
 * entered through the screen's own switch.
 */
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
