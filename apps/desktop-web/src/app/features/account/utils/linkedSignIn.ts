import type { LinkedAccountsView } from '@lemoncloud/chatic-backend-api';

/** The fields of the relay user this reads. */
export interface RelaySignInUser {
    userRole?: string;
    link$?: LinkedAccountsView;
}

/** How the account signs in, as far as the relay user says. */
export type LinkedSignIn =
    | { kind: 'unknown' }
    | { kind: 'guest' }
    | { kind: 'social'; provider?: string; hint?: string }
    | { kind: 'phone'; hint?: string }
    | { kind: 'email'; hint?: string }
    | { kind: 'none' };

/**
 * Reads the account's sign-in method off the relay user's `link$` slot.
 *
 * A missing slot is `unknown`, never `none`: the profile may not have arrived yet, or the server may
 * never have built the slot for an older account, and either would otherwise tell a signed-in person
 * they have no sign-in method. Once the slot is there, an entry that is absent really is absent.
 */
export const linkedSignInOf = (user: RelaySignInUser | null | undefined): LinkedSignIn => {
    if (!user) return { kind: 'unknown' };
    if (user.userRole === 'guest') return { kind: 'guest' };
    const link = user.link$;
    if (!link) return { kind: 'unknown' };
    if (link.social) return { kind: 'social', provider: link.social.provider, hint: link.social.hint };
    if (link.phone) return { kind: 'phone', hint: link.phone.hint };
    if (link.email) return { kind: 'email', hint: link.email.hint };
    return { kind: 'none' };
};
