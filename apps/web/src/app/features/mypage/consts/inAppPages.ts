/** A page deployed for trying the sub WebView, as the Lab lists it. */
export interface InAppPage {
    id: string;
    /** Translation keys: the page's own name, and one line on what it is. */
    titleKey: string;
    subtitleKey: string;
    /** The app it is, resolved to where it is hosted as a page link is, so the two never disagree. */
    appId: string;
    /**
     * Where the Lab lists it. `experiment` puts it in the Experiments card for everyone; `debug`
     * keeps it in the In-app card that only debug mode draws, for pages not yet meant for users.
     */
    surface: 'experiment' | 'debug';
}

/**
 * The pages the Lab opens in the sub WebView — games so far, not only games later. Built and
 * deployed outside this repository. Each names its app id; where the app is hosted is the sub WebView
 * app list's (`bridge/subWebViewApps.ts`), for this build's stage, so a new page needs a line there,
 * one here and its strings.
 */
export const IN_APP_PAGES: readonly InAppPage[] = [
    {
        id: 'enhanceDou',
        titleKey: 'mypage.lab.inAppPages.enhanceDou.title',
        subtitleKey: 'mypage.lab.inAppPages.enhanceDou.subtitle',
        appId: 'dou-raise',
        surface: 'experiment',
    },
];
