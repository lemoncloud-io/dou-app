import {
    deviceLanguageCandidates,
    readShellConfigBag,
    readStoredLanguagePreference,
    resolveLanguage,
} from './languagePreference';

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
    it("reads the choice from @chatic/config's local mirror when there is no shell", () => {
        const storage = storageWith('"ko"');

        expect(readStoredLanguagePreference({ storage })).toBe('ko');
        expect(storage.getItem).toHaveBeenCalledWith('@chatic/config.ui.language');
    });

    // The shell copy is the one that survives the OS clearing WebView storage, and the resolver ranks
    // the shell lane above the mirror — the early read has to agree with what config.get says later.
    it("prefers the shell's boot envelope over the local mirror", () => {
        expect(readStoredLanguagePreference({ bag: { 'ui.language': '"en"' }, storage: storageWith('"ko"') })).toBe(
            'en'
        );
        expect(readStoredLanguagePreference({ bag: { 'ui.language': '"system"' }, storage: storageWith('"ko"') })).toBe(
            'system'
        );
    });

    it('falls back to the mirror when the envelope has nothing usable', () => {
        expect(readStoredLanguagePreference({ bag: {}, storage: storageWith('"ko"') })).toBe('ko');
        expect(readStoredLanguagePreference({ bag: { 'ui.language': '"ja"' }, storage: storageWith('"ko"') })).toBe(
            'ko'
        );
    });

    it('treats a missing, unknown or corrupt value as system', () => {
        expect(readStoredLanguagePreference({ storage: storageWith(null) })).toBe('system');
        expect(readStoredLanguagePreference({ storage: storageWith('"ja"') })).toBe('system');
        expect(readStoredLanguagePreference({ storage: storageWith('{not json') })).toBe('system');
        expect(readStoredLanguagePreference({})).toBe('system');
    });

    it('treats a storage that throws as system', () => {
        const storage = {
            getItem: () => {
                throw new Error('blocked');
            },
        };
        expect(readStoredLanguagePreference({ storage })).toBe('system');
    });
});

describe('readShellConfigBag', () => {
    afterEach(() => {
        delete (window as { CHATIC_APP_CONFIG_BAG?: unknown }).CHATIC_APP_CONFIG_BAG;
    });

    it('returns the injected envelope, and nothing outside a shell', () => {
        expect(readShellConfigBag()).toBeUndefined();

        (window as { CHATIC_APP_CONFIG_BAG?: unknown }).CHATIC_APP_CONFIG_BAG = { 'ui.language': '"ko"' };

        expect(readShellConfigBag()).toEqual({ 'ui.language': '"ko"' });
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
