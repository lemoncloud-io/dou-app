import { act, renderHook } from '@testing-library/react';

import { useLanguagePreference } from './useLanguagePreference';

const changeLanguage = jest.fn();
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { changeLanguage } }) }));

let stored: unknown;
const setConfig = jest.fn((_key: string, value: unknown) => {
    stored = value;
});
jest.mock('@chatic/config', () => ({
    config: { set: (key: string, value: unknown, options: unknown) => setConfig(key, value, options) },
    storageKeyFor: (key: string) => `@chatic/config.${key}`,
}));
jest.mock('@chatic/config/react', () => ({ useConfigValue: () => stored }));

const setDeviceLanguage = (injected: string | undefined, languages: string[]) => {
    (window as { CHATIC_APP_CURRENT_LANGUAGE?: string }).CHATIC_APP_CURRENT_LANGUAGE = injected;
    Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
    Object.defineProperty(window.navigator, 'language', { value: languages[0] ?? '', configurable: true });
};

beforeEach(() => {
    jest.clearAllMocks();
    stored = undefined;
    setDeviceLanguage(undefined, ['en-US']);
});

describe('useLanguagePreference', () => {
    it('reads as system when nothing has been chosen', () => {
        const { result } = renderHook(() => useLanguagePreference());
        expect(result.current.preference).toBe('system');
    });

    it('reads an unknown stored value as system rather than passing it through', () => {
        stored = 'ja';
        const { result } = renderHook(() => useLanguagePreference());
        expect(result.current.preference).toBe('system');
    });

    it('pins a chosen language and switches to it', () => {
        const { result } = renderHook(() => useLanguagePreference());

        act(() => result.current.setPreference('ko'));

        expect(setConfig).toHaveBeenCalledWith('ui.language', 'ko', { lane: 'local' });
        expect(changeLanguage).toHaveBeenCalledWith('ko');
    });

    it('choosing system switches to the device language the shell reports', () => {
        setDeviceLanguage('ko', ['en-US']);
        stored = 'en';
        const { result } = renderHook(() => useLanguagePreference());

        act(() => result.current.setPreference('system'));

        expect(setConfig).toHaveBeenCalledWith('ui.language', 'system', { lane: 'local' });
        expect(changeLanguage).toHaveBeenCalledWith('ko');
    });
});
