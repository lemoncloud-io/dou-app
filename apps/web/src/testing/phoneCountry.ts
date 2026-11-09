import { config } from '@chatic/config';

/**
 * Test-only: the phone fields' remembered country, which lives in the `ui.phoneCountry` setting.
 *
 * Wires `@chatic/config` to this tab's web storages (once per call — `init` only re-reads storage), then
 * clears the remembered pick and, given a country, seeds it through the same `local` lane
 * `rememberCountry` writes. Seeding the pick uses the production "last explicit pick wins" path rather
 * than stubbing around jsdom's `en-US` locale.
 */
export const seedPhoneCountry = (country?: string): void => {
    localStorage.clear();
    config.init({
        env: { stage: () => 'PROD', buildStage: () => 'PROD', platform: () => 'web', raw: () => undefined },
        storage: { local: localStorage, session: sessionStorage },
    });
    config.clear('ui.phoneCountry', { lane: 'local' });
    if (country) config.set('ui.phoneCountry', country, { lane: 'local' });
};

/** The remembered pick, as the phone fields would read it. */
export const rememberedPhoneCountry = (): string | undefined => config.get<string>('ui.phoneCountry') || undefined;
