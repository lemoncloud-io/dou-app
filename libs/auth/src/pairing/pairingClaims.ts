import type { PairingClaimView } from '@chatic/http';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { applySessionToken } from '../socket/applySessionToken';

type ApprovedClaim = Extract<PairingClaimView, { status: 'approved' }>;

export type PairingClaimAnswer =
    | Exclude<PairingClaimView, { status: 'approved' }>
    | (Omit<ApprovedClaim, 'session'> & { sessionHandle?: string });

export const PAIRING_SESSION_UNKNOWN = 'PAIRING_SESSION_UNKNOWN';

const HELD_AT_MOST = 2;

const held = new Map<string, UserTokenView>();
let issued = 0;

export const holdPairingClaim = (view: PairingClaimView): PairingClaimAnswer => {
    if (view.status !== 'approved') return view;
    const { session, ...rest } = view;
    if (!session || view.target.type === 'cloud') return rest;
    issued += 1;
    const handle = `pairing-session-${issued}-${Math.random().toString(36).slice(2, 10)}`;
    held.set(handle, session);
    while (held.size > HELD_AT_MOST) held.delete(held.keys().next().value as string);
    return { ...rest, sessionHandle: handle };
};

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

export const resetPairingClaims = (): void => {
    held.clear();
    issued = 0;
};
