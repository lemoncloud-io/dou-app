import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { LemonHmacSigner } from '@chatic/auth-sign';

import { webTransport } from '../../http/transport';
import { cloudStore, relayStore } from '../store/stores';
import { rebuildSessionIdentity } from '../store';
import { mergeRefreshedCloudToken, mergeRefreshedRelayToken } from './utils/tokenMerge';

/**
 * The session half of the Auth SDK bridge (ADR-0076 결정 5).
 *
 * Three things the SDK cannot do for itself, all keyed by the socket's own server so relay and cloud
 * — which bootstrap independently — never seed, sign or write back against the wrong one
 * (multi-socket-design.md §6-6, §7): **seed** the `register({ token, authId })` call, **sign** its
 * stateless callback, and **write back** a refreshed token into the store the HTTP/AWS signing layers
 * read.
 *
 * These were three loose exports in `services.ts`, and they are already consumed as ONE object
 * (`SocketSessionDelegate`) — a class is their real shape (ADR-0070 §0). `SessionAuthAdapter` is the
 * `*Adapter` form this package already uses for "session state shaped to fit a port"
 * (`SessionCredentialAdapter implements CredentialStalenessPort`).
 *
 * **Terminal expiry is deliberately NOT here.** `SocketSessionDelegate.onAuthExpired` needs
 * `credentialRenewers`, which lives in `socket/auth` — importing it would invert the one-way
 * `socket/auth → session` edge and close a cycle. `socket/auth/sessionDelegate.ts` composes this
 * adapter with the renewers into the full delegate instead.
 *
 * Contract + branching rationale live in `docs/socket/auth/signing.md`. The lemon-hmac signature
 * never depends on the token string (the signer signs an empty identityToken slot), so the
 * SDK-injected token argument is ignored and the signature is recomputed from the server's stored
 * fields.
 */
export interface ISessionAuthAdapter {
    getAuthRegistration(kind: ServerKind): Promise<{ token: string; authId: string } | null>;
    signAuth(kind: ServerKind, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(kind: ServerKind, view: UserTokenView): Promise<void>;
}

// `calcSignature`'s web-core shim was a wrapper over `@chatic/auth-sign`; call the lib directly here.
const authSigner = new LemonHmacSigner();
const calcSignature = (
    payload: { authId: string; accountId: string; identityId: string; identityToken: string },
    current: string,
    userAgent: string
): string => authSigner.sign(payload, { current, userAgent }).signature;

/** Which socket/server a bridge helper acts on. Dual-socket callers pass this explicitly. */
export type ServerKind = 'relay' | 'cloud';

/**
 * Seeds the SDK `register({ token, authId })` call for a specific server kind. Returns null when
 * either field is unavailable so the caller can defer register until a token exists.
 */
class SessionAuthAdapter implements ISessionAuthAdapter {
    async getAuthRegistration(kind: ServerKind): Promise<{ token: string; authId: string } | null> {
        if (kind === 'cloud') {
            const token = cloudStore.getIdentityToken();
            const authId = cloudStore.getCloudToken()?.Token?.authId ?? null;
            return token && authId ? { token, authId } : null;
        }

        // relay: identity token from the relay store, authId from the cached lemon signature.
        const token = relayStore.getIdentityToken();
        const authId = relayStore.getRelayToken()?.$auth?.id || null;

        return token && authId ? { token, authId } : null;
    }

    /**
     * Backs the SDK stateless `sign` callback with the lemon-hmac signature for a specific server kind.
     * `target` (a site-switch selector) is accepted for callback-shape parity but does not change the
     * signature — it is carried only in the SDK `auth.switch` packet (see signing.md §1).
     */
    async signAuth(kind: ServerKind, _target?: string): Promise<{ signature: string; current: string }> {
        if (kind === 'cloud') {
            const cloudToken = cloudStore.getCloudToken()?.Token;
            const authId = cloudToken?.authId;
            const accountId = cloudToken?.accountId;
            const identityId = cloudToken?.identityId;
            if (!authId || !accountId || !identityId) {
                throw new Error('Missing cloud token fields for socket auth signature');
            }
            const current = new Date().toISOString();
            const signature = calcSignature(
                { authId, accountId, identityId, identityToken: '' },
                current,
                navigator.userAgent
            );
            return { signature, current };
        }

        // relay: compute the signature over `$auth.id` ourselves instead of reusing
        // webTransport.getTokenSignature(), which keys on `Token.authId` for the HTTP refresh path.
        const relayToken = relayStore.getRelayToken();
        const authId = relayToken?.$auth?.id;
        const accountId = relayToken?.Token?.accountId;
        const identityId = relayToken?.Token?.identityId;
        if (!authId || !accountId || !identityId) {
            throw new Error('Missing relay token fields for socket auth signature');
        }
        const current = new Date().toISOString();
        const signature = calcSignature(
            { authId, accountId, identityId, identityToken: '' },
            current,
            navigator.userAgent
        );
        return { signature, current };
    }

    /**
     * Writes an SDK-refreshed token back into the web-core store for a specific server kind — the
     * per-socket writeback routing that unblocks dual sockets (multi-socket-design.md §6-6): a relay
     * refresh arriving while cloud is active must land in the relay store, not the active one.
     *
     * Asymmetric by design (signing.md §3): relay must also rebuild the lemon-web-core AWS credential
     * cache, because relay signed HTTP signs from that cache and not from relayStore. Cloud only
     * persists the merged token — **it has no HTTP signing to keep alive.** Nothing signs with the cloud
     * credential: the one request that did was the cloud HTTP refresh, deleted by ADR-0070, and requests
     * bound for a cloud host are signed the relay way. What the cloud token still owes is the SOCKET
     * signature (`signServerAuth('cloud')`, a lemon HMAC over `authId`/`accountId`/`identityId`), and
     * that reads the store live per packet — which is why persisting is the whole job here.
     */
    async commitRefreshedToken(kind: ServerKind, view: UserTokenView): Promise<void> {
        if (kind === 'cloud') {
            const merged = mergeRefreshedCloudToken(cloudStore.getCloudToken(), view);
            cloudStore.saveCloudToken(merged);
            // Keep the per-cloud cache level with the active token. That cache is the OTHER copy of this
            // token and it serves any re-switch back to this cloud within its own expiry margin, so
            // leaving it behind means a later re-entry can install the PRE-refresh credential and re-open
            // the 403 window this writeback just closed.
            const delegationToken = cloudStore.getDelegationToken();
            if (delegationToken?.cloudId) {
                cloudStore.setCachedCloudTokens(delegationToken.cloudId, { delegationToken, cloudToken: merged });
            }
        } else if (view.Token) {
            // Merge rules + their justification live in `utils/tokenMerge` (ADR-0076 결정 5): the three
            // preserved `Token` fields each have their own reason and now each has its own test.
            const merged = mergeRefreshedRelayToken(
                relayStore.getRelayToken(),
                view as Parameters<typeof mergeRefreshedRelayToken>[1]
            );
            // `credential` is OPTIONAL in the wire contract, and lemon's `buildCredentialsByToken`
            // throws `.AccessKeyId (string) is required!` when it is absent — which used to take the
            // store write below down with it, silently: the caller fires this writeback with `void`, so
            // the rejection surfaced as an unhandled promise and `requestRelaySessionRefresh` had already
            // resolved `true`. Rebuild the credential cache only when the view actually carries one,
            // and keep the store write either way (identityToken and the profile fields are still good).
            //
            // Read off `view`, NOT `merged`: merged inherits the previous credential (so the store copy
            // keeps naming whatever is actually signing), and asking merged here would rebuild lemon's
            // cache from the credential it already holds — a no-op that also silences the warn below,
            // which is the only signal that a refresh arrived without signing material.
            const issued = view.Token.credential;
            if (issued?.AccessKeyId && issued?.SecretKey) {
                await webTransport.buildCredentialsByToken(merged.Token);
            } else {
                // Signed HTTP keeps signing with the previous credential — which is exactly the state
                // that 403s once it lapses. Loud, because nothing downstream can detect this.
                logger.warn('AUTH', '[commitServerRefreshedToken] refresh view carried no AWS credential', {
                    data: { kind, hasToken: !!merged.Token.identityToken },
                });
            }
            relayStore.saveRelayToken(merged);
        }

        // Re-derive uid / identity from the freshly written token so activeServer + UI stay in sync.
        rebuildSessionIdentity();
    }
}

/**
 * Stateless — every member reads the stores live per call, so one instance serves the whole app
 * (the same reasoning as `credentialFreshness` and the renewers).
 */
export const sessionAuthAdapter: ISessionAuthAdapter = new SessionAuthAdapter();
