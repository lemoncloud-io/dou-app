/**
 * Milliseconds until `expiration` — the `Expiration` field of an AWS credential, an ISO-8601 instant
 * the wire types as `Date` but delivers as a string. Negative means already lapsed.
 *
 * `null` is "cannot measure", and it covers both an ABSENT and an UNPARSABLE instant. Returning NaN
 * for the latter would be worse than useless: every comparison against NaN is false, so an
 * unparsable expiry would silently read as "still fresh" at one call site and "lapsed" at the next.
 *
 * **Why this pure helper lives under `store/` rather than beside its auth consumer.** There were
 * three copies of this arithmetic — this function (unreferenced), `CredentialFreshness`'s private
 * `remainingFrom`, and an inline expression in `cloudStore.getCachedCloudTokens`. Collapsing them to
 * one needs a module BOTH `session/store` and `session/auth` may import, and the store's passivity
 * rule (ADR-0070 결정 1 규칙 1, enforced by eslint `no-restricted-imports`) forbids `store/**` from
 * importing `../auth`. The dependency only runs the other way, so the shared leaf belongs here.
 */
export const msUntilExpiration = (expiration: unknown, now: number): number | null => {
    if (!expiration) {
        return null;
    }
    const expiresAt = new Date(expiration as string).getTime();
    return Number.isFinite(expiresAt) ? expiresAt - now : null;
};
