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
 * rule (ADR-0070 Decision 1 rule 1, enforced by eslint `no-restricted-imports`) forbids `store/**` from
 * importing `../auth`. The dependency only runs the other way, so the shared leaf belongs here.
 */
export const msUntilExpiration = (expiration: unknown, now: number): number | null => {
    if (!expiration) {
        return null;
    }
    const expiresAt = new Date(expiration as string).getTime();
    return Number.isFinite(expiresAt) ? expiresAt - now : null;
};

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const decodeBase64Url = (segment: string): string | null => {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const char of segment.replace(/=+$/, '')) {
        const index = BASE64URL.indexOf(char === '+' ? '-' : char === '/' ? '_' : char);
        if (index < 0) return null;
        value = (value << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out += String.fromCharCode((value >> bits) & 0xff);
        }
    }
    return out;
};

export const msUntilTokenExpiry = (token: unknown, now: number): number | null => {
    if (typeof token !== 'string') return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = decodeBase64Url(payload);
    if (json === null) return null;
    try {
        const exp = (JSON.parse(json) as { exp?: unknown }).exp;
        return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 - now : null;
    } catch {
        return null;
    }
};
