/**
 * Milliseconds until `expiration` — the `Expiration` field of an AWS credential, an ISO-8601 instant
 * the wire types as `Date` but delivers as a string. Negative means already lapsed.
 *
 * `null` is "cannot measure", and it covers both an ABSENT and an UNPARSABLE instant. Returning NaN
 * for the latter would be worse than useless: every comparison against NaN is false, so an
 * unparsable expiry would silently read as "still fresh" at one call site and "lapsed" at the next.
 */
export const msUntilExpiration = (expiration: unknown, now: number): number | null => {
    if (!expiration) {
        return null;
    }
    const expiresAt = new Date(expiration as string).getTime();
    return Number.isFinite(expiresAt) ? expiresAt - now : null;
};
