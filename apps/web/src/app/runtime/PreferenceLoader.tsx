import { useEffect } from 'react';
import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';
import type { PreferenceKey } from '@chatic/app-messages';

import { appBridge } from '../bridge';
import { parseThemeBridgeValue } from '../stores/preferenceParsers';

interface ManagedKey {
    /** The registry key `config` resolves this preference under. */
    configKey: string;
    /** The legacy `PreferenceKey` an app build old enough to lack the boot-injection bag still answers to. */
    nativeKey: PreferenceKey;
    /** Bridge value -> the value to write into `configKey`, or null to skip (unusable). */
    decode: (value: unknown) => unknown;
}

// Only these three ever had a native-bridge-backed answer worth fetching — `language` is owned by
// i18next, and every other `ui.*`/`debug.*` key is either `local`-only (nothing for native to
// answer) or has no legacy bridge counterpart at all (see legacyPreferenceMigration.ts).
const MANAGED_KEYS: readonly ManagedKey[] = [
    {
        configKey: 'ui.blurLastMessage',
        nativeKey: 'blurLastMessage',
        decode: value => value === true || value === 'true',
    },
    // isFirstRun's polarity is the inverse of onboardingCompleted's.
    {
        configKey: 'ui.onboardingCompleted',
        nativeKey: 'isFirstRun',
        decode: value => !(value === true || value === 'true'),
    },
    { configKey: 'ui.theme', nativeKey: 'theme', decode: parseThemeBridgeValue },
];

/**
 * Bridge fallback read: fills `@chatic/config`'s shell lane for any managed key the boot-injection
 * bag did not already answer (an app build that predates `CHATIC_APP_CONFIG_BAG` — web ships before
 * the app).
 *
 * Runs only on native, and only for keys `config.init()` resolved to nothing but the floor
 * (`defaultValue`/a stage rule) — a value already supplied by the shell (the common case, once the
 * app updates) or by a prior local mirror never triggers a bridge round-trip. Written back through
 * `config.set(..., { lane: 'shell' })`, the same lane the boot injection itself would have used, so
 * this is exactly a slower version of what the injection already does — including feeding the same
 * local-storage mirror (`ConfigFacade`'s own `persist: 'shell'` fallback), so the NEXT boot resolves
 * synchronously without needing this fetch again, even before the app itself updates.
 *
 * Renders nothing; mounted once under AppRuntime.
 */
export const PreferenceLoader = (): null => {
    useEffect(() => {
        if (!isNative()) return;
        MANAGED_KEYS.forEach(({ configKey, nativeKey, decode }) => {
            if (config.snapshot(configKey)?.isOverridden) return; // shell or local already answered
            appBridge.fetchPreference({ key: nativeKey }).then(response => {
                if (response.data.value == null) return;
                const decoded = decode(response.data.value);
                if (decoded != null) config.set(configKey, decoded, { lane: 'shell' });
            });
        });
    }, []);

    return null;
};
