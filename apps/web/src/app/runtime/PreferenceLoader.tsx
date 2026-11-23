import { useEffect } from 'react';
import type { PreferenceKey } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime';

import { syncLanguageChoiceToShell } from '../bridge';
import { toLanguagePreference } from '../../i18n/languagePreference';
import { parseThemeBridgeValue } from '../stores/preferenceParsers';

interface ManagedKey {
    configKey: string;
    nativeKey: PreferenceKey;
    decode: (value: unknown) => unknown;
}

const MANAGED_KEYS: readonly ManagedKey[] = [
    {
        configKey: 'ui.blurLastMessage',
        nativeKey: 'blurLastMessage',
        decode: value => value === true || value === 'true',
    },
    {
        configKey: 'ui.onboardingCompleted',
        nativeKey: 'isFirstRun',
        decode: value => !(value === true || value === 'true'),
    },
    { configKey: 'ui.theme', nativeKey: 'theme', decode: parseThemeBridgeValue },
];

export const PreferenceLoader = (): null => {
    useEffect(() => {
        const store = runtime.appShell.preferences;
        if (!store) return;
        MANAGED_KEYS.forEach(({ configKey, nativeKey, decode }) => {
            if (runtime.settings.snapshot(configKey)?.isOverridden) return;
            store.read(nativeKey).then(value => {
                if (value == null) return;
                const decoded = decode(value);
                if (decoded != null) runtime.settings.set(configKey, decoded, { lane: 'shell' });
            });
        });
    }, []);

    useEffect(() => {
        if (!runtime.appShell.preferences) return;
        const snapshot = runtime.settings.snapshot('ui.language');
        if (!snapshot?.isOverridden) return;
        void syncLanguageChoiceToShell(toLanguagePreference(snapshot.value));
    }, []);

    return null;
};
