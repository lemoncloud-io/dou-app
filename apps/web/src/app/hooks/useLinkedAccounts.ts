import { useMyUser } from './useMyUser';

/**
 * Whether a credential is linked, or whether we simply do not know.
 *
 * `'unknown'` is not a nicety — it is the only honest answer for two situations the client cannot tell
 * apart from "not linked":
 * - the profile has not landed yet (first paint runs off the token seed alone), and
 * - the server never built the `link$` slot for this user — the one-time backfill that fills it for
 *   accounts created before the unified path may not have run.
 *
 * Collapsing either into `false` makes the app demand a credential the user already has: a
 * social-registered user would be told to link social (403 `type-linked`), a phone user would be asked
 * to verify a number they already own. So callers must fall back on `'unknown'`, never gate on it
 * (ADR-0042 §5).
 */
export type LinkedState = 'linked' | 'absent' | 'unknown';

export interface LinkedAccounts {
    /** Is a phone number linked to this user? */
    phone: LinkedState;
    /** Is a social account linked to this user? */
    social: LinkedState;
    /** Last 4 digits of the linked number, for display only. Absent unless `phone === 'linked'`. */
    phoneHint?: string;
    /** Provider of the linked social account (`apple` · `google`), for display only. */
    socialProvider?: string;
}

/**
 * What the server says this user has proved — read off `link$` on the cached user row.
 *
 * The truth of ownership lives on the account records, not here; `link$` is the pointer the server
 * exposes so a client can render state without a per-credential probe. It is a HINT for choosing a
 * screen. The contract that actually blocks a bad link is the server's own answer: `verify`'s
 * `linkable`/`reason`, or a 409/`403` from `confirm`.
 */
export const useLinkedAccounts = (): LinkedAccounts => {
    const me = useMyUser();

    // No row yet, or a row the server built without the slot: we know nothing either way.
    if (!me?.link$) return { phone: 'unknown', social: 'unknown' };

    const { phone, social } = me.link$;
    return {
        // The slot exists, so its contents are authoritative — an absent entry really means unlinked.
        phone: phone ? 'linked' : 'absent',
        social: social ? 'linked' : 'absent',
        phoneHint: phone?.hint,
        socialProvider: social?.provider,
    };
};
