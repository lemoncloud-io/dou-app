/**
 * index.html is one static file for every reader: link-preview crawlers never run JS, so it ships
 * `lang="en"` and cannot describe a Korean reader. Keeping the attribute in step with the active
 * language is therefore this module's job, and it is invisible on screen — nothing renders
 * differently when it breaks, while screen readers and browser translation quietly get it wrong.
 */
import i18n from './index';

describe('document language sync', () => {
    it('describes the language the page is actually showing at startup', () => {
        // jsdom reports en-US, so this is the English case; the Korean one is the switch below.
        expect(document.documentElement.lang).toBe('en');
    });

    it('follows a switch to Korean', async () => {
        await i18n.changeLanguage('ko');

        expect(document.documentElement.lang).toBe('ko');
    });

    it('follows a switch back to English', async () => {
        await i18n.changeLanguage('ko');
        await i18n.changeLanguage('en');

        expect(document.documentElement.lang).toBe('en');
    });

    // The attribute carries the language i18next settled on, not the code it was handed: 'ko-KR'
    // would otherwise name a locale whose copy is not what the page renders, and the rest of the app
    // narrows with `i18n.language === 'ko'`.
    it('carries the resolved language, not a regional code', async () => {
        await i18n.changeLanguage('ko-KR');

        expect(document.documentElement.lang).toBe('ko');
        expect(i18n.t('footer.terms')).toBe('이용약관');
    });
});
