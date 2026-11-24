import { logger } from '@chatic/bridges';
import { readShellHarness, shellCheckoutUrl, type ShellHarness, type WebCheckout } from '@chatic/runtime-web';

import { leaveForWeb, webCheckout } from './webCheckout';

export interface ShellCheckoutRequest {
    readonly url: string;
    readonly replace: boolean;
}

export interface ShellCheckoutScreen {
    bind(open: (request: ShellCheckoutRequest) => void): () => void;
}

export interface ShellWebCheckout extends WebCheckout {
    readonly shellScreen: ShellCheckoutScreen;
}

export const isProductionBuild = (env: string | undefined = import.meta.env.VITE_ENV): boolean =>
    env !== 'DEV' && env !== 'LOCAL';

export const shellHarness = (page: object | undefined = globalThis.window): ShellHarness | null =>
    readShellHarness(page, { productionBuild: isProductionBuild() });

export const shellWebCheckout = (harness: ShellHarness): ShellWebCheckout => {
    let screen: ((request: ShellCheckoutRequest) => void) | undefined;
    return {
        kind: 'web',
        shellScreen: {
            bind: open => {
                screen = open;
                return () => {
                    if (screen === open) screen = undefined;
                };
            },
        },
        open: (url, { replace = false } = {}) => {
            const target = shellCheckoutUrl(url, harness);
            if (screen) return screen({ url: target, replace });
            logger.warn(
                'iap.shell_checkout_unanswered',
                '[checkout] no shell checkout screen; leaving for the website'
            );
            leaveForWeb(target, { replace });
        },
    };
};

export const hybridWebCheckout = (page?: object): WebCheckout => {
    const harness = shellHarness(page);
    return harness ? shellWebCheckout(harness) : webCheckout();
};
