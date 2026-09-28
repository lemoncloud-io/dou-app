import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { webTransport } from '../../http/transport';
import { cloudStore, relayStore } from '../store/stores';
import { rebuildSessionIdentity } from '../store';
import { recordCloudIdentity } from './cloudIdentity';
import { calcSignature } from './utils/calcSignature';
import { mergeRefreshedCloudToken, mergeRefreshedRelayToken } from './utils/tokenMerge';

/**
 * The session half of the Auth SDK bridge (ADR-0076 Decision 5).
 *
 * Three things the SDK cannot do for itself, all keyed by the socket's own server — the cloud id
 * its slot serves, the relay's being `RELAY_CLOUD_ID` — so slots that bootstrap independently never
 * seed, sign or write back against the wrong one (multi-socket-design.md §6-6, §7): **seed** the
 * `register({ token, authId })` call, **sign** its stateless callback, and **write back** a refreshed
 * token into the store the HTTP/AWS signing layers read.
 *
 * A cloud's material comes from `cloudStore.getCloudTokenOf(cid)`: the session store while that
 * cloud is the committed one, the per-cloud token cache otherwise. The two are written level on every
 * commit, so which one answers changes nothing for the committed cloud — what it adds is that a cloud
 * which is NOT committed can seed and sign too, which is what lets a socket stay authenticated to a
 * cloud the user is not looking at.
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
/**
 * The seed `auth.register` needs, plus the material the SAME server signs with.
 *
 * `signing` is **diagnostic only** — `register()` takes `token`/`authId` and nothing else. It rides
 * along because these three values are read from one store in one place here, and the question they
 * answer (which of the HMAC's keys does the server disagree with?) is otherwise unanswerable from a
 * log: the only way to ask it once was a production DynamoDB read.
 */
export interface AuthRegistration {
    token: string;
    authId: string;
    signing?: { accountId?: string; identityId?: string };
}

/**
 * Every member takes the cloud id of the socket it acts on. The socket layer passes its slot key,
 * which IS that id; the relay's is `RELAY_CLOUD_ID`.
 */
export interface ISessionAuthAdapter {
    getAuthRegistration(cid: string): Promise<AuthRegistration | null>;
    signAuth(cid: string, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(cid: string, view: UserTokenView): Promise<void>;
}

/**
 * Seeds the SDK `register({ token, authId })` call for a specific server. Returns null when either
 * field is unavailable so the caller can defer register until a token exists.
 */
class SessionAuthAdapter implements ISessionAuthAdapter {
    async getAuthRegistration(cid: string): Promise<AuthRegistration | null> {
        if (cid !== RELAY_CLOUD_ID) {
            const cloudToken = cloudStore.getCloudTokenOf(cid)?.Token;
            const token = cloudToken?.identityToken ?? null;
            const authId = cloudToken?.authId ?? null;
            return token && authId
                ? { token, authId, signing: { accountId: cloudToken?.accountId, identityId: cloudToken?.identityId } }
                : null;
        }

        // relay: identity token from the relay store, authId from the cached lemon signature.
        const relayToken = relayStore.getRelayToken();
        const token = relayStore.getIdentityToken();
        const authId = relayToken?.$auth?.id || null;

        return token && authId
            ? {
                  token,
                  authId,
                  signing: { accountId: relayToken?.Token?.accountId, identityId: relayToken?.Token?.identityId },
              }
            : null;
    }

    /**
     * Backs the SDK stateless `sign` callback with the lemon-hmac signature for a specific server.
     * `target` (a site-switch selector) is accepted for callback-shape parity but does not change the
     * signature — it is carried only in the SDK `auth.switch` packet (see signing.md §1).
     */
    async signAuth(cid: string, _target?: string): Promise<{ signature: string; current: string }> {
        if (cid !== RELAY_CLOUD_ID) {
            const cloudToken = cloudStore.getCloudTokenOf(cid)?.Token;
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
        //
        // **Source of truth is the server's own signer, not this client.** `oauth2-support.ts`'s
        // `_sign`/`validateSignature` read EVERY field off the auth model — `$auth.id`,
        // `$auth.accountId`, `$auth.identityId` — so we read from `$auth` wherever the view exposes it.
        //
        // `identityId` is the one field we cannot follow. **`AuthView` declares it** — the type is
        // `Omit<Partial<AuthModel>, 'id'>`, so `$auth.identityId` compiles — but the wire never carries
        // it: `asUserTokenView` renders `$auth` with `hasCores = false`, and the transformer emits
        // `identityId` only on the `hasCores` branch. Reading it there would typecheck and be
        // `undefined` forever, so it is taken from `Token` on the ASSUMPTION that the two agree.
        //
        // In `issueAccessToken` they provably do — one local `identityId` (the Cognito response) is
        // written to the auth model and returned on `Token` in the same breath. The assumption breaks
        // exactly where this track's bug lives: a site-switch child auth is written WITHOUT the field,
        // so the server computes with `''` while we send the real one. Nothing on the wire tells us
        // that, which is why the divergence we CAN see is logged below rather than silently preferred.
        const relayToken = relayStore.getRelayToken();
        const relayAuth = relayToken?.$auth;
        const authId = relayAuth?.id;
        const identityId = relayToken?.Token?.identityId;

        // `$auth.accountId` first — it is what the server verifies against. `Token.accountId` is the
        // same value today (both are `$account.id` in `issueAccessToken`, and `makeAuthByAccount`
        // writes the same for a child), so this is a no-op that pins the SOURCE rather than the value.
        // It stops being a no-op if `issueAccessToken`'s `options.accountId` override is ever used —
        // that line rewrites `Token.accountId` alone and would reopen this exact class of bug.
        const accountId = relayAuth?.accountId ?? relayToken?.Token?.accountId;
        if (
            relayAuth?.accountId &&
            relayToken?.Token?.accountId &&
            relayAuth.accountId !== relayToken.Token.accountId
        ) {
            logger.warn('AUTH', '[signAuth] relay accountId differs between $auth and Token', {
                data: { authId, auth: relayAuth.accountId, token: relayToken.Token.accountId },
            });
        }

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
     * Writes an SDK-refreshed token back into the web-core store for a specific server — the
     * per-socket writeback routing that unblocks dual sockets (multi-socket-design.md §6-6): a relay
     * refresh arriving while cloud is active must land in the relay store, not the active one.
     *
     * Asymmetric by design (signing.md §3): relay must also rebuild the lemon-web-core AWS credential
     * cache, because relay signed HTTP signs from that cache and not from relayStore. A cloud only
     * persists the merged token — **it has no HTTP signing to keep alive.** Nothing signs with a cloud
     * credential: the one request that did was the cloud HTTP refresh, deleted by ADR-0070, and requests
     * bound for a cloud host are signed the relay way. What the cloud token still owes is the SOCKET
     * signature (`signAuth(cid)`, a lemon HMAC over `authId`/`accountId`/`identityId`), and that reads
     * the token live per packet — which is why persisting is the whole job here.
     *
     * WHERE a cloud's writeback persists is decided here, at write time: the session store when `cid`
     * is the committed cloud, the per-cloud cache alone otherwise. A refresh can arrive on a slot that
     * was committed when it booted and is not any more (a switch away with the slot still alive), and
     * writing it into the store then would hand the committed cloud another cloud's token.
     */
    async commitRefreshedToken(cid: string, view: UserTokenView): Promise<void> {
        if (cid !== RELAY_CLOUD_ID) {
            this.commitRefreshedCloudToken(cid, view);
            return;
        }
        if (view.Token) {
            // Merge rules + their justification live in `utils/tokenMerge` (ADR-0076 Decision 5): the three
            // preserved `Token` fields each have their own reason and now each has its own test.
            const stored = relayStore.getRelayToken();
            const merged = mergeRefreshedRelayToken(stored, view as Parameters<typeof mergeRefreshedRelayToken>[1]);

            // The merge DISCARDS a server-sent `$auth` when one is already stored, because a site
            // switch returns a child auth that cannot be signed with (see `mergeRefreshedRelayToken`).
            // That is a silent decision against the server's own answer, so say it out loud — and carry
            // the signing material, because the next question is always "which of these three keys does
            // the server disagree with", and answering it once cost a production DynamoDB read.
            const offered = (view as UserTokenView & { $auth?: { id?: string } }).$auth?.id;
            const held = (stored as (UserTokenView & { $auth?: { id?: string } }) | null)?.$auth?.id;
            if (offered && held && offered !== held) {
                logger.warn('AUTH', '[commitServerRefreshedToken] kept the stored $auth, dropped the served one', {
                    data: {
                        cid,
                        held,
                        offered,
                        accountId: merged.Token?.accountId,
                        identityId: merged.Token?.identityId,
                    },
                });
            }
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
                    data: { cid, hasToken: !!merged.Token.identityToken },
                });
            }
            relayStore.saveRelayToken(merged);
        }

        // Re-derive uid / identity from the freshly written token so activeServer + UI stay in sync.
        rebuildSessionIdentity();
    }

    private commitRefreshedCloudToken(cid: string, view: UserTokenView): void {
        const delegationToken = cloudStore.getDelegationToken();
        if (delegationToken?.cloudId === cid) {
            const merged = mergeRefreshedCloudToken(cloudStore.getCloudToken(), view);
            cloudStore.saveCloudToken(merged);
            // Keep the per-cloud cache level with the active token. That cache is the OTHER copy of this
            // token and it serves any re-switch back to this cloud within its own expiry margin, so
            // leaving it behind means a later re-entry can install the PRE-refresh credential and re-open
            // the 403 window this writeback just closed.
            cloudStore.setCachedCloudTokens(cid, { delegationToken, cloudToken: merged });
            recordCloudIdentity(cid, merged);
            // Re-derive uid / identity from the freshly written token so activeServer + UI stay in sync.
            rebuildSessionIdentity();
            return;
        }

        // Not the committed cloud: the cache entry is the only copy this socket signs from, so it is
        // the only thing updated. The store, the derived identity and the session signal describe the
        // committed cloud and must not move for a refresh that belongs to another one.
        const cached = cloudStore.peekCachedCloudTokens(cid);
        if (!cached) {
            // The slot registered from this entry, so it is gone because the cloud was dropped
            // (terminal expiry, a cloud logout) — or because leaving the COMMITTED cloud cleared the
            // whole cache, which `clearSession` still does today. Say so; there is nothing to merge
            // into, and the slot re-registers from a fresh issue on its next renewal.
            logger.warn(
                'AUTH',
                '[commitRefreshedToken] no cached tokens for a non-committed cloud — writeback dropped',
                {
                    data: { cid },
                }
            );
            return;
        }
        const merged = mergeRefreshedCloudToken(cached.cloudToken, view);
        cloudStore.setCachedCloudTokens(cid, { delegationToken: cached.delegationToken, cloudToken: merged });
        recordCloudIdentity(cid, merged);
    }
}

/**
 * Stateless — every member reads the stores live per call, so one instance serves the whole app
 * (the same reasoning as `credentialFreshness` and the renewers).
 */
export const sessionAuthAdapter: ISessionAuthAdapter = new SessionAuthAdapter();
