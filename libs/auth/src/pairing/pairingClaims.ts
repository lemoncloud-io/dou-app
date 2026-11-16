import type { PairingClaimView } from '@chatic/http';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { applySessionToken } from '../socket/applySessionToken';

type ApprovedClaim = Extract<PairingClaimView, { status: 'approved' }>;

/**
 * A pairing claim's answer as the code screen holds it: the relay's answer with a relay approval's
 * session replaced by a handle. The session is the account's own token, so it stays here, with the
 * session's owner; `applyPairingSession(handle)` signs this device in with it.
 */
export type PairingClaimAnswer =
    | Exclude<PairingClaimView, { status: 'approved' }>
    | (Omit<ApprovedClaim, 'session'> & { sessionHandle?: string });

/** The `code` applying a pairing session throws with for a handle this runtime does not hold. */
export const PAIRING_SESSION_UNKNOWN = 'PAIRING_SESSION_UNKNOWN';

/**
 * How many sessions wait at most. A device shows one code screen, so one is the rule; two cover a code
 * replaced while its claim was in flight, when the replaced code's approval and the new one's can both
 * land. The cap only bounds what a flow that never applied leaves behind.
 */
const HELD_AT_MOST = 2;

const held = new Map<string, UserTokenView>();
let issued = 0;

/**
 * Keeps a relay approval's session out of the answer and hands back the answer with a handle in its
 * place. A cloud approval is entered by delegation, never with a session, so one it carries is not kept;
 * every other answer passes through as it is.
 */
export const holdPairingClaim = (view: PairingClaimView): PairingClaimAnswer => {
    if (view.status !== 'approved') return view;
    const { session, ...rest } = view;
    if (!session || view.target.type === 'cloud') return rest;
    issued += 1;
    const handle = `pairing-session-${issued}-${Math.random().toString(36).slice(2, 10)}`;
    held.set(handle, session);
    // The oldest go first.
    while (held.size > HELD_AT_MOST) held.delete(held.keys().next().value as string);
    return { ...rest, sessionHandle: handle };
};

/**
 * Signs this device in with the session `handle` stands for — the way a phone login does. The session
 * is dropped whether or not that worked: the code screen does not retry an approval it could not apply
 * (it starts over with a new code), so a token kept after a failure would only linger.
 *
 * Throws `PAIRING_SESSION_UNKNOWN` for a handle not held (never given, already used, or past the cap).
 */
export const applyPairingSession = async (handle: string): Promise<void> => {
    const session = held.get(handle);
    if (!session) {
        throw Object.assign(new Error('The pairing session this names is not held by the runtime'), {
            code: PAIRING_SESSION_UNKNOWN,
        });
    }
    held.delete(handle);
    await applySessionToken(session);
};

/** Test seam: the held session is a process singleton. */
export const resetPairingClaims = (): void => {
    held.clear();
    issued = 0;
};
