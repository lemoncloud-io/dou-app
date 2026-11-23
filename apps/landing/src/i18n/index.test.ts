import i18n from './index';

describe('document language sync', () => {
    it('describes the language the page is actually showing at startup', () => {
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

    it('carries the resolved language, not a regional code', async () => {
        await i18n.changeLanguage('ko-KR');

        expect(document.documentElement.lang).toBe('ko');
        expect(i18n.t('footer.terms')).toBe('서비스 이용 약관');
    });
});
