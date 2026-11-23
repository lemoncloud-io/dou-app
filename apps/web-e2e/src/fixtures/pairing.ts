import type { Request } from '@playwright/test';

import type { FakeBackend, HttpHandler } from './backend';
import { GUEST, registerDeviceAnswer } from './guest';

export const PAIRED_ACCOUNT = {
    name: 'paired@example.test',
    approverName: 'E2E Approver iPhone',
} as const;

export type ClaimAnswer =
    | { status: 'pending' | 'expired' | 'denied' | 'revoked' | 'claimed' }
    | { status: 'approved'; target: { type: 'relay' }; approver: { name: string }; session: unknown };

export interface PairingRelay {
    requests: unknown[];
    claims: string[];
    maxInFlight: number;
}

export interface PairingOptions {
    claim: (index: number, pairingId: string) => ClaimAnswer;
    claimDelayMs?: number;
    lifetimeMs?: number;
}

export const PAIRING_CODES = ['07344168', '52190837'] as const;

const INTERVAL_S = 1;

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

export const pairedSession = (deviceId: string) => {
    const answer = registerDeviceAnswer(deviceId);
    return {
        ...answer,
        userRole: 'user',
        name: PAIRED_ACCOUNT.name,
        account$: { id: answer.accountId, stereo: 'google', name: PAIRED_ACCOUNT.name },
        Token: {
            ...answer.Token,
            identityToken: [
                base64Url({ alg: 'none', typ: 'JWT' }),
                base64Url({
                    cid: '#',
                    sid: GUEST.sid,
                    gid: null,
                    uid: GUEST.uid,
                    aid: GUEST.authId,
                    did: null,
                    roles: ['user'],
                    Site: { name: 'default', code: '' },
                    User: { name: PAIRED_ACCOUNT.name, stereo: 'google', nick: '', login: '' },
                    iss: 'e2e',
                    iat: Math.floor(GUEST.createdAt / 1000),
                    exp: 4_102_444_800,
                }),
                'e2e-unsigned',
            ].join('.'),
        },
    };
};

export const relayApproval = (backend: FakeBackend): ClaimAnswer => ({
    status: 'approved',
    target: { type: 'relay' },
    approver: { name: PAIRED_ACCOUNT.approverName },
    session: pairedSession(backend.deviceId),
});

const pairingIdOf = (request: Request): string => new URL(request.url()).pathname.split('/').slice(-2)[0];

export const installPairing = (backend: FakeBackend, options: PairingOptions): PairingRelay => {
    const relay: PairingRelay = { requests: [], claims: [], maxInFlight: 0 };
    const lifetimeMs = options.lifetimeMs ?? 5 * 60_000;
    const claimDelayMs = options.claimDelayMs ?? 0;
    let inFlight = 0;

    const request: HttpHandler = req => {
        relay.requests.push(req.postDataJSON());
        const index = relay.requests.length - 1;
        return {
            pairingId: `e2e-pairing-${index + 1}`,
            code: PAIRING_CODES[index] ?? PAIRING_CODES[PAIRING_CODES.length - 1],
            expiredAt: Date.now() + lifetimeMs,
            interval: INTERVAL_S,
        };
    };

    const claim: HttpHandler = async req => {
        const pairingId = pairingIdOf(req);
        relay.claims.push(pairingId);
        const index = relay.claims.length;
        inFlight += 1;
        relay.maxInFlight = Math.max(relay.maxInFlight, inFlight);
        try {
            if (claimDelayMs > 0) await new Promise(resolve => setTimeout(resolve, claimDelayMs));
            return options.claim(index, pairingId);
        } finally {
            inFlight -= 1;
        }
    };

    const routes: Record<string, HttpHandler> = { 'POST /pairings/0/request': request };
    PAIRING_CODES.forEach((_, index) => {
        routes[`POST /pairings/e2e-pairing-${index + 1}/claim`] = claim;
    });
    backend.useHttp(routes);
    backend.useSocket({ 'auth.logout': () => ({}) });
    return relay;
};
