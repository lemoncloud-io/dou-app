import type { LinkedAccountsView } from '@lemoncloud/chatic-backend-api';

export interface RelaySignInUser {
    userRole?: string;
    link$?: LinkedAccountsView;
}

export type LinkedMethod =
    | { kind: 'social'; provider?: string; hint?: string }
    | { kind: 'phone'; hint?: string }
    | { kind: 'email'; hint?: string };

export type LinkedSignIn =
    | { kind: 'unknown' }
    | { kind: 'guest' }
    | { kind: 'linked'; methods: LinkedMethod[] }
    | { kind: 'none' };

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
