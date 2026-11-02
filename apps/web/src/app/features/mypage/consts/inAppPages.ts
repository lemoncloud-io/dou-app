/** A page deployed for trying the sub WebView, as the Lab lists it. */
export interface InAppPage {
    id: string;
    /** Translation keys: the page's own name, and one line on what it is. */
    titleKey: string;
    subtitleKey: string;
    url: string;
}

/**
 * The pages kept on `apps-dev.chatic.io` for trying the sub WebView — games so far, not only games
 * later. Built and deployed outside this repository; the shell's allowlist takes any one-label
 * subdomain there, so a new page needs only a
 * line here and its two strings.
 */
export const IN_APP_PAGES: readonly InAppPage[] = [
    {
        id: 'echo',
        titleKey: 'mypage.lab.inAppPages.echo.title',
        subtitleKey: 'mypage.lab.inAppPages.echo.subtitle',
        url: 'https://sample.apps-dev.chatic.io/',
    },
    {
        id: 'raiseDou',
        titleKey: 'mypage.lab.inAppPages.raiseDou.title',
        subtitleKey: 'mypage.lab.inAppPages.raiseDou.subtitle',
        url: 'https://sample1.apps-dev.chatic.io/',
    },
];
