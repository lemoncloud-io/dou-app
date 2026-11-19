import type { WebCheckout } from '@chatic/runtime-web';

/**
 * Leaves the app for a page of the website. `replace` takes the current entry's place in history, so
 * back from the website skips it.
 */
export const leaveForWeb = (url: string, { replace = false }: { replace?: boolean } = {}): void => {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
};

/** The website sells: a purchase completes there, and this page learns of it from the membership. */
export const webCheckout = (): WebCheckout => ({ kind: 'web', open: leaveForWeb });
