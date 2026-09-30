import { isLanguagePreference, resolveAppLanguage } from './languagePreference';

describe('languagePreference', () => {
    it('knows exactly the three choices the web sends', () => {
        expect(['system', 'ko', 'en'].every(isLanguagePreference)).toBe(true);
        expect(isLanguagePreference('ja')).toBe(false);
        expect(isLanguagePreference({ state: { language: 'ko' } })).toBe(false);
    });

    it('resolves system to the device language and a pin to itself', () => {
        expect(resolveAppLanguage('system', 'ja')).toBe('ja');
        expect(resolveAppLanguage('ko', 'en')).toBe('ko');
    });
});
