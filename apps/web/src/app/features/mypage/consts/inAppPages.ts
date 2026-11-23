export interface InAppPage {
    id: string;
    titleKey: string;
    subtitleKey: string;
    appId: string;
    surface: 'miniApp' | 'debug';
}

export const IN_APP_PAGES: readonly InAppPage[] = [
    {
        id: 'enhanceDou',
        titleKey: 'mypage.lab.inAppPages.enhanceDou.title',
        subtitleKey: 'mypage.lab.inAppPages.enhanceDou.subtitle',
        appId: 'dou-raise',
        surface: 'miniApp',
    },
    {
        id: 'closerWord',
        titleKey: 'mypage.lab.inAppPages.closerWord.title',
        subtitleKey: 'mypage.lab.inAppPages.closerWord.subtitle',
        appId: 'dou-closer-word',
        surface: 'miniApp',
    },
    {
        id: 'sky45',
        titleKey: 'mypage.lab.inAppPages.sky45.title',
        subtitleKey: 'mypage.lab.inAppPages.sky45.subtitle',
        appId: 'dou-sky',
        surface: 'miniApp',
    },
];
