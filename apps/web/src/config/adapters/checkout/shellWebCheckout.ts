import { logger } from '@chatic/bridges';
import { readShellHarness, shellCheckoutUrl, type ShellHarness, type WebCheckout } from '@chatic/runtime-web';

import { leaveForWeb, webCheckout } from './webCheckout';

interface ShellCheckoutRequest {
    readonly replace: boolean;
}

interface ShellCheckoutScreen {
    readonly sandbox: boolean;
    readonly subscriptionWeb?: string;
    bind(open: (request: ShellCheckoutRequest) => void): () => void;
}

interface ShellWebCheckout extends WebCheckout {
    readonly shellScreen: ShellCheckoutScreen;
}

export const isProductionBuild = (env: string | undefined = import.meta.env.VITE_ENV): boolean =>
    env !== 'DEV' && env !== 'LOCAL';

const shellHarness = (page: object | undefined = globalThis.window): ShellHarness | null =>
    readShellHarness(page, { productionBuild: isProductionBuild() });

export const shellWebCheckout = (harness: ShellHarness): ShellWebCheckout => {
    let screen: ((request: ShellCheckoutRequest) => void) | undefined;
    return {
        kind: 'web',
        shellScreen: {
            sandbox: harness.sandbox,
            ...(harness.subscriptionWeb ? { subscriptionWeb: harness.subscriptionWeb } : {}),
            bind: open => {
                screen = open;
                return () => {
                    if (screen === open) screen = undefined;
                };
            },
        },
        open: (url, { replace = false } = {}) => {
            if (screen) return screen({ replace });
            const target = shellCheckoutUrl(url, harness);
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
