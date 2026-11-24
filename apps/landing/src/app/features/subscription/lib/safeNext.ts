import { ROUTES } from '../../../routes/paths';

import type { Account } from '@chatic/web-checkout';

const PROBE_ORIGIN = 'https://next.invalid';

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

export const landingAfterSignIn = (account: Account, next?: string | null): string => {
    if (account.billingSource === 'appStore' || account.billingSource === 'googlePlay') {
        return ROUTES.subscription.storeManaged;
    }
    return safeNext(next) ?? ROUTES.subscription.plans;
};
