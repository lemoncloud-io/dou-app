import { readShellHarness, shellCheckoutUrl, type ShellHarness, type WebCheckout } from '@chatic/runtime-web';

import { leaveForWeb, webCheckout } from './webCheckout';

interface HarnessedWebCheckout extends WebCheckout {
    readonly sandbox: boolean;
}

export const isProductionBuild = (env: string | undefined = import.meta.env.VITE_ENV): boolean =>
    env !== 'DEV' && env !== 'LOCAL';

const shellHarness = (page: object | undefined = globalThis.window): ShellHarness | null =>
    readShellHarness(page, { productionBuild: isProductionBuild() });

export const shellWebCheckout = (harness: ShellHarness): HarnessedWebCheckout => ({
    kind: 'web',
    sandbox: harness.sandbox,
    open: (url, { replace = false } = {}) => leaveForWeb(shellCheckoutUrl(url, harness), { replace }),
});

export const hybridWebCheckout = (page?: object): WebCheckout => {
    const harness = shellHarness(page);
    return harness ? shellWebCheckout(harness) : webCheckout();
};
