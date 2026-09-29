import { deviceLanguageCandidates, readStoredLanguagePreference, resolveLanguage } from './languagePreference';

jest.mock('@chatic/config', () => ({ storageKeyFor: (key: string) => `@chatic/config.${key}` }));

const storageWith = (value: string | null) => ({ getItem: jest.fn(() => value) });

describe('resolveLanguage', () => {
    it('keeps an explicit choice whatever the device says', () => {
        expect(resolveLanguage('en', ['ko-KR'])).toBe('en');
        expect(resolveLanguage('ko', ['en-US'])).toBe('ko');
    });

    it('follows the device for system, reading a region tag as its language', () => {
        expect(resolveLanguage('system', ['ko-KR'])).toBe('ko');
        expect(resolveLanguage('system', ['en_GB'])).toBe('en');
    });

    it('skips device languages without a bundle and takes the next one that has one', () => {
        expect(resolveLanguage('system', ['ja-JP', 'ko-KR', 'en-US'])).toBe('ko');
    });

    it('falls back to English when nothing the device reports is supported', () => {
        expect(resolveLanguage('system', ['ja-JP'])).toBe('en');
        expect(resolveLanguage('system', [])).toBe('en');
    });
});

describe('readStoredLanguagePreference', () => {
    it("reads the choice from @chatic/config's local lane", () => {
        const storage = storageWith('"ko"');

        expect(readStoredLanguagePreference(storage)).toBe('ko');
        expect(storage.getItem).toHaveBeenCalledWith('@chatic/config.ui.language');
    });

    it('treats a missing, unknown or corrupt value as system', () => {
        expect(readStoredLanguagePreference(storageWith(null))).toBe('system');
        expect(readStoredLanguagePreference(storageWith('"ja"'))).toBe('system');
        expect(readStoredLanguagePreference(storageWith('{not json'))).toBe('system');
        expect(readStoredLanguagePreference(undefined)).toBe('system');
    });

    it('treats a storage that throws as system', () => {
        const storage = {
            getItem: () => {
                throw new Error('blocked');
            },
        };
        expect(readStoredLanguagePreference(storage)).toBe('system');
    });
});

describe('deviceLanguageCandidates', () => {
    afterEach(() => {
        delete (window as { CHATIC_APP_CURRENT_LANGUAGE?: string }).CHATIC_APP_CURRENT_LANGUAGE;
    });

    // The iOS WebView answers navigator.language with the app bundle's localization (English), so the
    // shell's report of the real device locale has to win.
    it("puts the shell's device language ahead of what the WebView reports", () => {
        (window as { CHATIC_APP_CURRENT_LANGUAGE?: string }).CHATIC_APP_CURRENT_LANGUAGE = 'ko';
        Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true });
        Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });

        const candidates = deviceLanguageCandidates();

        expect(candidates[0]).toBe('ko');
        expect(resolveLanguage('system', candidates)).toBe('ko');
    });

    it("uses the browser's own list when there is no shell", () => {
        Object.defineProperty(window.navigator, 'languages', { value: ['ko-KR', 'en-US'], configurable: true });
        Object.defineProperty(window.navigator, 'language', { value: 'ko-KR', configurable: true });

        expect(deviceLanguageCandidates()).toEqual(['ko-KR', 'en-US', 'ko-KR']);
    });
});
