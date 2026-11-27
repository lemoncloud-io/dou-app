import type { WebCheckout } from '@chatic/runtime-hybrid-web';

export const leaveForWeb = (url: string, { replace = false }: { replace?: boolean } = {}): void => {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
};

export const webCheckout = (): WebCheckout => ({ kind: 'web', open: leaveForWeb });
