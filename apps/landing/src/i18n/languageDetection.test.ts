const scenarios = [
    { label: 'a Korean browser that reports only a regional code', languages: ['ko-KR'], expected: 'ko' },
    { label: 'a Korean browser that also reports the bare code', languages: ['ko-KR', 'ko'], expected: 'ko' },
    { label: 'an English browser', languages: ['en-US'], expected: 'en' },
    { label: 'a language the site does not carry', languages: ['ja-JP'], expected: 'en' },
];

const detectWith = async (languages: string[]) => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    vi.stubGlobal('navigator', { languages, language: languages[0] });
    vi.resetModules();

    const { default: i18n } = await import('./index');
    return i18n;
};

describe('first-visit language detection', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it.each(scenarios)('serves $expected to $label', async ({ languages, expected }) => {
        const i18n = await detectWith(languages);

        expect(i18n.language).toBe(expected);
    });

    it('caches the language it resolved', async () => {
        await detectWith(['ko-KR']);

        expect(localStorage.getItem('@landing.language')).toBe('ko');
    });

    it('leaves the document describing the reader, not the static attribute', async () => {
        const i18n = await detectWith(['ko-KR']);

        expect(i18n.t('footer.terms')).toBe('서비스 이용 약관');
        expect(document.documentElement.lang).toBe('ko');
    });
});
