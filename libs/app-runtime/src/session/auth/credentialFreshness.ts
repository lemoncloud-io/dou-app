import { cloudStore, relayStore } from '../store/stores';

/**
 * Whose credential is being measured. **Not an `HttpRoute`** — that was the old key and it was
 * wrong in both directions: `oauth`/`iap` are routes with no credential of their own (they sign with
 * relay's), and `cloud` is not a route at all any more, yet the cloud credential still has a
 * measurable life that a caller cares about. The honest key is the SERVER that issued it.
 */
export type CredentialOwner = 'relay' | 'cloud';

/**
 * "How much life is left on this server's credential?"
 *
 * Read off the AWS credential's own `Expiration` rather than lemon's stored `expired_time`: the two
 * clocks diverge exactly in the case that matters (a socket refresh that updated the token but
 * carried no credential leaves `expired_time` fresh and the signing material dead).
 *
 * Do NOT measure it off the token view's `expiresIn` either — that field describes the SESSION
 * (observed at 30 days) while the credential it ships with lives about an hour. They answer
 * different questions and differ by three orders of magnitude.
 *
 * The two owners are asked for different reasons, and only one of them is about signing:
 *
 * - **relay** — the signing question. Relay is the only signed HTTP route, so this is what tells a
 *   signature rejection apart from a network outage (`CredentialStalenessPort`).
 * - **cloud** — a token-age proxy. Nothing signs with the cloud credential (the one request that
 *   did was the cloud HTTP refresh, deleted by ADR-0070), but it is minted alongside the cloud token
 *   and expires with it, so `useCloudCredentialGuard` reads it to know when that SOCKET session
 *   needs re-issuing.
 */
export interface ICredentialFreshness {
    /** Milliseconds left, or null when there is nothing to measure. Negative means already lapsed. */
    timeToExpiry(owner: CredentialOwner, now?: number): number | null;
    /** True only when the credential is measurably PAST its expiry. */
    isStale(owner: CredentialOwner, now?: number): boolean;
}

/**
 * Relay and cloud read different stores but answer the same question, which is why this sits beside
 * the cloud token helper instead of inside either store — and why acting on the answer still belongs
 * to the caller: relay re-mints by refresh, cloud by re-issue.
 */
class CredentialFreshness implements ICredentialFreshness {
    timeToExpiry(owner: CredentialOwner, now: number = Date.now()): number | null {
        // Read the stores DIRECTLY, both of them. A per-owner wrapper that delegated back here used
        // to exist and recursed the moment this method delegated to it — the crash that removed it.
        const expiration =
            owner === 'cloud'
                ? cloudStore.getCredential()?.Expiration
                : relayStore.getRelayToken()?.Token?.credential?.Expiration;
        return CredentialFreshness.remainingFrom(expiration, now);
    }

    /**
     * Unmeasurable (no session, no credential on the token view) is deliberately NOT stale: an absent
     * credential means the request went out unsigned, which is a different failure with a different
     * fix, and guessing would attach a confident wrong explanation to it.
     */
    isStale(owner: CredentialOwner, now: number = Date.now()): boolean {
        const remaining = this.timeToExpiry(owner, now);
        return remaining != null && remaining <= 0;
    }

    private static remainingFrom(expiration: unknown, now: number): number | null {
        if (!expiration) return null;
        const expiresAt = new Date(expiration as string).getTime();
        return Number.isFinite(expiresAt) ? expiresAt - now : null;
    }
}

/** Stateless — every read goes to the stores, so one instance serves the whole app. */
export const credentialFreshness: ICredentialFreshness = new CredentialFreshness();
