import type { PreferenceKey } from '@chatic/app-messages';
import { provider } from '../services';
import { DEFAULT_LANGUAGE_PREFERENCE, isLanguagePreference } from './languagePreference';
import type { LanguagePreference } from './languagePreference';

const LANGUAGE_KEY: PreferenceKey = 'language';
/** The web's own registry key, persisted by `@chatic/config`'s shell lane into `configKvService`. */
const CONFIG_KEY = 'ui.language';

/** Persist the choice as a plain value ('ko'), replacing whatever was under the key before. */
export const writeLanguagePreference = (preference: LanguagePreference): void => {
    provider.preferenceService.setSync(LANGUAGE_KEY, preference);
};

/** The choice as the web itself stored it (`SaveConfigValue`), or null when it has not. */
const readWebConfigChoice = (): LanguagePreference | null => {
    const raw = provider.configKvService.getAll()[CONFIG_KEY];
    if (typeof raw !== 'string') return null;
    try {
        const value: unknown = JSON.parse(raw);
        return isLanguagePreference(value) ? value : null;
    } catch {
        return null;
    }
};

/**
 * Synchronously read the choice during module evaluation, so the first alert or error screen the
 * shell draws is already in the chosen language — `t()` is synchronous and cannot wait for an async
 * rehydrate.
 *
 * **The web's config value wins.** The web stores the choice in two places on every change — its
 * config bag (`ui.language`) and this `language` key — and the config bag is what the web itself
 * resolves from. Reading it first means a choice made while an older shell was installed survives
 * the update: that shell kept `language` in its own zustand envelope, which is discarded below, but
 * the config bag already held the choice. It also heals a `SavePreference` that was dropped.
 *
 * **A legacy value is discarded, not parsed.** This key used to hold a zustand `persist` envelope:
 * the device language captured on first launch, or the language in effect that an older web mirrored
 * into it. A detector's guess and a person's pick sit in the same value, so nothing from that era can
 * be read as a choice; it is replaced with `system`.
 */
export const readLanguagePreference = (): LanguagePreference => {
    const raw: unknown = provider.preferenceService.getSync(LANGUAGE_KEY);

    const fromWeb = readWebConfigChoice();
    if (fromWeb) {
        if (raw !== fromWeb) writeLanguagePreference(fromWeb);
        return fromWeb;
    }

    if (isLanguagePreference(raw)) return raw;
    if (raw !== null && raw !== undefined) writeLanguagePreference(DEFAULT_LANGUAGE_PREFERENCE);
    return DEFAULT_LANGUAGE_PREFERENCE;
};
