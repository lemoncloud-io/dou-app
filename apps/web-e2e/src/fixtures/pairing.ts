import type { Request } from '@playwright/test';

import type { FakeBackend, HttpHandler } from './backend';
import { GUEST, registerDeviceAnswer } from './guest';

/**
 * Device pairing on the relay, from the requesting device's side: `POST /pairings/0/request` hands out
 * a code, and `POST /pairings/{id}/claim` is polled until the approving device has answered. Nothing
 * here plays the approving device — a scenario decides what each claim answers, which is all the code
 * screen ever sees of it. Every value is invented.
 */

/** The account the approving device is signed in as, and the name it shows for itself. */
export const PAIRED_ACCOUNT = {
    name: 'paired@example.test',
    approverName: 'E2E Approver iPhone',
} as const;

/** One answer to `claim`, as the relay sends it. */
export type ClaimAnswer =
    | { status: 'pending' | 'expired' | 'denied' | 'revoked' | 'claimed' }
    | { status: 'approved'; target: { type: 'relay' }; approver: { name: string }; session: unknown };

/** What a scenario reads back: every request and claim the page sent, and claims on the wire at once. */
export interface PairingRelay {
    /** The bodies of `POST /pairings/0/request`, oldest first. */
    requests: unknown[];
    /** The pairing id of every claim, oldest first. */
    claims: string[];
    /** The most claims that were ever unanswered at the same moment. One, when the page waits its turn. */
    maxInFlight: number;
}

export interface PairingOptions {
    /** The answer to the claim with this 1-based index, counted across every code. */
    claim: (index: number, pairingId: string) => ClaimAnswer;
    /** How long the relay takes over each claim. Longer than `interval`, so a claim the page did not wait for overlaps. */
    claimDelayMs?: number;
    /** How long each code lives, from the moment it is handed out. */
    lifetimeMs?: number;
}

/** The codes handed out, in order: the first request gets the first. Eight digits, as the relay draws them. */
export const PAIRING_CODES = ['07344168', '52190837'] as const;

/** Seconds between claims. The relay's own is longer; one keeps a scenario short. */
const INTERVAL_S = 1;

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * The approval's session: the guest's own answer promoted to an account, as a relay approval hands
 * over the approver's account. Its identity token differs from the guest's, so applying it is an
 * identity change the socket has to follow; `$auth.id` is kept, because the socket re-registers with it.
 */
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

/** A relay approval carrying `pairedSession` — what the first claim after the approval answers. */
export const relayApproval = (backend: FakeBackend): ClaimAnswer => ({
    status: 'approved',
    target: { type: 'relay' },
    approver: { name: PAIRED_ACCOUNT.approverName },
    session: pairedSession(backend.deviceId),
});

const pairingIdOf = (request: Request): string => new URL(request.url()).pathname.split('/').slice(-2)[0];

/** Installs `/pairings/**` on the relay. The returned record fills in as the page sends. */
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
    // A route is keyed by its exact path, so each pairing id the page can be handed gets its own.
    PAIRING_CODES.forEach((_, index) => {
        routes[`POST /pairings/e2e-pairing-${index + 1}/claim`] = claim;
    });
    backend.useHttp(routes);
    // Applying a relay approval re-registers the socket on the same connection: it signs the guest out
    // (`auth.logout`) and back in as the account (`auth.update`, already answered for every session).
    // The page does not wait for the logout's answer, but the relay accepts it rather than refusing it,
    // and an answered logout keeps it off the unanswered list.
    backend.useSocket({ 'auth.logout': () => ({}) });
    return relay;
};
