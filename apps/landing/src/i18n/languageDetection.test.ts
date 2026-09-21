/**
 * Which language a first-time visitor gets, measured rather than assumed.
 *
 * The trap this pins: `htmlTag` is a detector like any other, and it reads the same `lang`
 * attribute index.html ships and this module rewrites. i18next takes the first exactly-supported
 * code out of the whole detected list before it tries stripping a region from any of them, so a
 * static `lang` outranks a browser that reports only `ko-KR` — while `lang="ko"` was in the file,
 * every such browser was served Korean, en-US and ja-JP included. `htmlTag` is out of
 * `detection.order` for that reason, and these cases fail if it comes back.
 */
const scenarios = [
    // A Korean browser reports the region; only Chromium adds the bare code behind it.
    { label: 'a Korean browser that reports only a regional code', languages: ['ko-KR'], expected: 'ko' },
    { label: 'a Korean browser that also reports the bare code', languages: ['ko-KR', 'ko'], expected: 'ko' },
    { label: 'an English browser', languages: ['en-US'], expected: 'en' },
    { label: 'a language the site does not carry', languages: ['ja-JP'], expected: 'en' },
];

const detectWith = async (languages: string[]) => {
    localStorage.clear();
    // Mirror the shipped index.html, so a regression that lets the attribute vote is visible here.
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

    // The detected result is cached, so a wrong first resolution is not a one-page mistake — it is
    // the language that visitor keeps until they find the header toggle.
    it('caches the language it resolved', async () => {
        await detectWith(['ko-KR']);

        expect(localStorage.getItem('@landing.language')).toBe('ko');
    });

    // What the reader gets and what a crawler reads are two different answers, and this is the one
    // place both are asserted together.
    it('leaves the document describing the reader, not the static attribute', async () => {
        const i18n = await detectWith(['ko-KR']);

        expect(i18n.t('footer.terms')).toBe('이용약관');
        expect(document.documentElement.lang).toBe('ko');
    });
});
