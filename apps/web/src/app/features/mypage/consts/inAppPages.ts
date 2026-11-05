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
 * The pages the Lab opens in the sub WebView — games so far, not only games later. Built and
 * deployed outside this repository; the shell's allowlist takes any one-label subdomain of
 * `apps.chatic.io` (and `apps-dev.chatic.io` in a development build), so a new page needs only a
 * line here and its strings.
 */
export const IN_APP_PAGES: readonly InAppPage[] = [
    {
        id: 'enhanceDou',
        titleKey: 'mypage.lab.inAppPages.enhanceDou.title',
        subtitleKey: 'mypage.lab.inAppPages.enhanceDou.subtitle',
        url: 'https://dou-raise.apps.chatic.io/',
        surface: 'experiment',
    },
];
