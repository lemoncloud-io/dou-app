import type { LinkedAccountsView } from '@lemoncloud/chatic-backend-api';

/** The fields of the relay user this reads. */
export interface RelaySignInUser {
    userRole?: string;
    link$?: LinkedAccountsView;
}

/** One way into the account. */
export type LinkedMethod =
    | { kind: 'social'; provider?: string; hint?: string }
    | { kind: 'phone'; hint?: string }
    | { kind: 'email'; hint?: string };

/** How the account signs in, as far as the relay user says. */
export type LinkedSignIn =
    | { kind: 'unknown' }
    | { kind: 'guest' }
    | { kind: 'linked'; methods: LinkedMethod[] }
    | { kind: 'none' };

/**
 * Reads the account's sign-in methods off the relay user's `link$` slot, social first, then phone,
 * then email. An account can hold one of each — a number it signed up with and the Google linked to it.
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
    const methods: LinkedMethod[] = [];
    if (link.social) methods.push({ kind: 'social', provider: link.social.provider, hint: link.social.hint });
    if (link.phone) methods.push({ kind: 'phone', hint: link.phone.hint });
    if (link.email) methods.push({ kind: 'email', hint: link.email.hint });
    return methods.length ? { kind: 'linked', methods } : { kind: 'none' };
};
