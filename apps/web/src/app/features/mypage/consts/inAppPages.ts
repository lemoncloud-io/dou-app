/** A page deployed for trying the sub WebView, as the Lab lists it. */
export interface InAppPage {
    id: string;
    /** Translation keys: the page's own name, and one line on what it is. */
    titleKey: string;
    subtitleKey: string;
    url: string;
    /**
     * Where the Lab lists it. `experiment` puts it in the Experiments card for everyone; `debug`
     * keeps it in the In-app card that only debug mode draws, for pages not yet meant for users.
     */
    surface: 'experiment' | 'debug';
}

/**
 * The pages kept on `apps-dev.chatic.io` for trying the sub WebView — games so far, not only games
 * later. Built and deployed outside this repository; the shell's allowlist takes any one-label
 * subdomain there, so a new page needs only a
 * line here and its strings.
 */
export const IN_APP_PAGES: readonly InAppPage[] = [
    {
        id: 'echo',
        titleKey: 'mypage.lab.inAppPages.echo.title',
        subtitleKey: 'mypage.lab.inAppPages.echo.subtitle',
        url: 'https://sample.apps-dev.chatic.io/',
        surface: 'debug',
    },
    {
        id: 'enhanceDou',
        titleKey: 'mypage.lab.inAppPages.enhanceDou.title',
        subtitleKey: 'mypage.lab.inAppPages.enhanceDou.subtitle',
        url: 'https://sample1.apps-dev.chatic.io/',
        surface: 'experiment',
    },
];
