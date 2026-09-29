import { logger } from '@chatic/bridges';
import type { PreferenceKey } from '@chatic/app-messages';
import type { IShellKvAdapter } from '@chatic/config';
import { appBridge } from '../bridge';

/**
 * Registry keys absorbed from the legacy `PREFERENCES` bridge (see `libs/config/src/registry/ui.ts`)
 * that still have an old-shell equivalent — an app build that predates `SaveConfigValue`/
 * `ClearConfigValue` can still persist these three through the bridge it already understands.
 * `ui.language` used to be the fourth; it became `persist: 'local'` and never reaches this adapter.
 * `debugSettings`, the 5th legacy key, has no config-key equivalent: the one capability it carried
 * (`webviewBaseUrlOverride`) was deleted outright rather than migrated.
 */
const LEGACY_PREFERENCE_KEY: Readonly<Partial<Record<string, PreferenceKey>>> = {
    'ui.theme': 'theme',
    'ui.blurLastMessage': 'blurLastMessage',
    'ui.onboardingCompleted': 'isFirstRun',
};

/** `ui.onboardingCompleted` is the positive of what the legacy `isFirstRun` stored. */
const toLegacyValue = (key: string, decoded: unknown): unknown =>
    key === 'ui.onboardingCompleted' ? !decoded : decoded;

const isNotFound = (error: unknown): boolean => (error as { code?: string } | undefined)?.code === 'NOT_FOUND';

/**
 * Whether this app build has already told us it does not know `SaveConfigValue`/`ClearConfigValue`.
 *
 * Module scope, like `NativeDBAdapter`'s `batchReadUnsupported` (`libs/db/src/native`): one installed
 * app, one answer, so every write/clear for the rest of this session skips straight to the legacy
 * fallback instead of re-learning the same `NOT_FOUND`.
 */
let configKvUnsupported = false;

/** Test seam — resets the learned old-shell fallback state. */
export const resetConfigKvSupport = (): void => {
    configKvUnsupported = false;
};

/**
 * `IShellKvAdapter` backed by the native bridge — the web-side half of ADR-0079's shell lane.
 *
 * `readBag()` reads the boot envelope the shell injects (`getConfigBagScript`,
 * `apps/mobile/src/app/webview/utils/injectionScripts.ts`) instead of round-tripping a bridge
 * message: the bag has to be in hand before `config.init()` runs, well before any request could
 * answer — the same reasoning that has `CHATIC_APP_THEME` seed the pre-paint theme read.
 *
 * `write`/`clear` degrade to the legacy `SavePreference`/`DeletePreference` bridge on a `NOT_FOUND`
 * from an app build that predates this one (the web deploys before the installed app updates), but only
 * for the three registry keys with a legacy equivalent (`LEGACY_PREFERENCE_KEY`). A key with no legacy
 * equivalent has nothing to fall back to, so `ConfigFacade`'s own confirmed-write retry — and,
 * failing that, `onShellWriteFailed` — is the correct outcome for those.
 */
export const createShellKvAdapter = (): IShellKvAdapter => ({
    readBag: () => {
        const bag = (window as unknown as { CHATIC_APP_CONFIG_BAG?: unknown }).CHATIC_APP_CONFIG_BAG;
        return bag && typeof bag === 'object' ? (bag as Record<string, string>) : {};
    },

    async write(key, value) {
        if (!configKvUnsupported) {
            try {
                await appBridge.saveConfigValueConfirmed({ key, value });
                return;
            } catch (error) {
                if (!isNotFound(error)) throw error;
                configKvUnsupported = true;
                logger.info(
                    'CONFIG',
                    `[shellKvAdapter] SaveConfigValue unsupported by this app build — falling back: ${key}`
                );
            }
        }

        const legacyKey = LEGACY_PREFERENCE_KEY[key];
        if (!legacyKey) throw { code: 'NOT_FOUND', message: `No legacy fallback for config key: ${key}` };

        await appBridge.savePreferenceConfirmed({ key: legacyKey, value: toLegacyValue(key, JSON.parse(value)) });
    },

    async clear(key) {
        if (!configKvUnsupported) {
            try {
                await appBridge.clearConfigValueConfirmed({ key });
                return;
            } catch (error) {
                if (!isNotFound(error)) throw error;
                configKvUnsupported = true;
                logger.info(
                    'CONFIG',
                    `[shellKvAdapter] ClearConfigValue unsupported by this app build — falling back: ${key}`
                );
            }
        }

        const legacyKey = LEGACY_PREFERENCE_KEY[key];
        if (!legacyKey) return; // no config-KV support and no legacy key either — nothing left to clear

        await appBridge.deletePreferenceConfirmed({ key: legacyKey });
    },
});
