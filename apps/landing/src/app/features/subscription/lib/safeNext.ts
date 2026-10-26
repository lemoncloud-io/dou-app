import { ROUTES } from '../../../routes/paths';

import type { Account } from '../types';

// A base no real address shares, so any `next` that resolves away from it named another origin.
const PROBE_ORIGIN = 'https://next.invalid';

/**
 * The return path a sign-in may send the reader back to, or `undefined` when `next` is not one.
 *
 * `next` arrives in the query string, so anyone can write it; taken as is it would turn the sign-in
 * page into a redirect to wherever a link says. Only a path inside the subscription pages is kept —
 * not another origin, not a protocol-relative `//host`, not a backslash form a browser reads as one,
 * not another part of this site, and not the sign-in pages themselves, which would send a signed-in
 * reader round in a loop.
 */
export const safeNext = (next: string | null | undefined): string | undefined => {
    if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\\s]/.test(next)) return undefined;

    let url: URL;
    try {
        url = new URL(next, PROBE_ORIGIN);
    } catch {
        return undefined;
    }
    if (url.origin !== PROBE_ORIGIN) return undefined;

    const { root, login } = ROUTES.subscription;
    const inside = url.pathname === root || url.pathname.startsWith(`${root}/`);
    const signIn = url.pathname === login || url.pathname.startsWith(`${login}/`);
    if (!inside || signIn) return undefined;

    return `${url.pathname}${url.search}${url.hash}`;
};

/**
 * Where a completed sign-in goes. A store subscriber is told to manage the subscription in the store,
 * whatever they came for. Anyone else goes back to the page they came from when that is a safe one,
 * and otherwise to the subscription list — which, for someone with no subscription, is its empty state
 * with the way to the plans.
 */
export const landingAfterSignIn = (account: Account, next?: string | null): string => {
    if (account.billingSource === 'appStore' || account.billingSource === 'googlePlay') {
        return ROUTES.subscription.storeManaged;
    }
    return safeNext(next) ?? ROUTES.subscription.root;
};
