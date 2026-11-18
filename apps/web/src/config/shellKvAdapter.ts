import { liveShellValue } from '@chatic/bridges';
import type { IShellKvAdapter } from '@chatic/config';
import { appBridge } from '../app/bridge';

/**
 * `IShellKvAdapter` backed by the native bridge — the web-side half of config's shell lane.
 *
 * `readBag()` reads the boot envelope the shell injects (`getConfigBagScript`,
 * `apps/mobile/src/app/webview/utils/injectionScripts.ts`) instead of round-tripping a bridge
 * message: the bag has to be in hand before `config.init()` runs, well before any request could
 * answer — the same reasoning that has `CHATIC_APP_THEME` seed the pre-paint theme read. It is read
 * live (`liveShellValue`) on each call, as the shell may write it again while the page runs.
 *
 * `write`/`clear` are confirmed requests; a failure surfaces to `ConfigFacade`, whose own retry — and,
 * failing that, `onShellWriteFailed` — handles it.
 */
export const createShellKvAdapter = (): IShellKvAdapter => ({
    readBag: () => {
        const bag = liveShellValue('CHATIC_APP_CONFIG_BAG');
        return bag && typeof bag === 'object' ? (bag as Record<string, string>) : {};
    },

    async write(key, value) {
        await appBridge.saveConfigValueConfirmed({ key, value });
    },

    async clear(key) {
        await appBridge.clearConfigValueConfirmed({ key });
    },
});
