import type { IShellKvAdapter } from '@chatic/config';
import { appBridge } from '../bridge';

/**
 * `IShellKvAdapter` backed by the native bridge — the web-side half of ADR-0079's shell lane.
 *
 * `readBag()` reads the boot envelope the shell injects (`getConfigBagScript`,
 * `apps/mobile/src/app/webview/utils/injectionScripts.ts`) instead of round-tripping a bridge
 * message: the bag has to be in hand before `config.init()` runs, well before any request could
 * answer — the same reasoning that has `CHATIC_APP_THEME` seed the pre-paint theme read.
 *
 * `write`/`clear` are confirmed requests; a failure surfaces to `ConfigFacade`, whose own retry — and,
 * failing that, `onShellWriteFailed` — handles it.
 */
export const createShellKvAdapter = (): IShellKvAdapter => ({
    readBag: () => {
        const bag = (window as unknown as { CHATIC_APP_CONFIG_BAG?: unknown }).CHATIC_APP_CONFIG_BAG;
        return bag && typeof bag === 'object' ? (bag as Record<string, string>) : {};
    },

    async write(key, value) {
        await appBridge.saveConfigValueConfirmed({ key, value });
    },

    async clear(key) {
        await appBridge.clearConfigValueConfirmed({ key });
    },
});
