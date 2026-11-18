import { runtime } from '@chatic/runtime';

import { wireTestSettings } from './settings';

/**
 * Test-only: the phone fields' remembered country, which lives in the `ui.phoneCountry` setting.
 *
 * Wires the settings to this tab's web storages, then clears the remembered pick and, given a country,
 * seeds it through the same `local` lane `rememberCountry` writes. Seeding the pick uses the production
 * "last explicit pick wins" path rather than stubbing around jsdom's `en-US` locale.
 */
export const seedPhoneCountry = (country?: string): void => {
    localStorage.clear();
    wireTestSettings({ local: localStorage, session: sessionStorage });
    runtime.settings.clear('ui.phoneCountry', { lane: 'local' });
    if (country) runtime.settings.set('ui.phoneCountry', country, { lane: 'local' });
};

/** The remembered pick, as the phone fields would read it. */
export const rememberedPhoneCountry = (): string | undefined =>
    runtime.settings.get<string>('ui.phoneCountry') || undefined;
