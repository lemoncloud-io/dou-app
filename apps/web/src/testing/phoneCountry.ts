import { runtime } from '@chatic/runtime-react';

import { wireTestSettings } from './settings';

export const seedPhoneCountry = (country?: string): void => {
    localStorage.clear();
    wireTestSettings({ local: localStorage, session: sessionStorage });
    runtime.settings.clear('ui.phoneCountry', { lane: 'local' });
    if (country) runtime.settings.set('ui.phoneCountry', country, { lane: 'local' });
};

export const rememberedPhoneCountry = (): string | undefined =>
    runtime.settings.get<string>('ui.phoneCountry') || undefined;
