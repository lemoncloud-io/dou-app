const HOSTS: readonly { stage: SubWebViewStage; app: string; pages: string }[] = [
    { stage: 'prod', app: 'app.chatic.io', pages: 'apps.chatic.io' },
    { stage: 'dev', app: 'app-dev.chatic.io', pages: 'apps-dev.chatic.io' },
];

export type SubWebViewStage = 'prod' | 'dev';

export const SUB_WEBVIEW_APP_LINK_PREFIX = '/apps/';

export const SUB_WEBVIEW_NAVIGATE_PATH = '/sub-webview';

export interface SubWebViewAppLinkTarget {
    appId: string;
    query: string;
}

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const LINK_REST = '/?(\\?[^#]*)?$';
const APP_LINK = new RegExp(`^https://([^/?#]+)/apps/(${LABEL})${LINK_REST}`);
const APP_LINK_ATTEMPT = /^https:\/\/([^/?#]+)\/apps(?=$|[/?#])/;
const LINK_PATH = new RegExp(`^/apps/(${LABEL})${LINK_REST}`);
const PAGE_ORIGIN = new RegExp(`^https://(${LABEL})\\.([^/?#:@]+)$`);
const URL_ORIGIN = /^(https:\/\/[^/?#]+)(?=$|[/?#])/;

const targetOf = (appId: string, query: string | undefined): SubWebViewAppLinkTarget => ({
    appId,
    query: query && query !== '?' ? query : '',
});

export const readSubWebViewAppLink = (link: string): (SubWebViewAppLinkTarget & { stage: SubWebViewStage }) | null => {
    const match = APP_LINK.exec(link);
    if (!match) return null;
    const [, host, appId, query] = match;
    const stage = HOSTS.find(entry => entry.app === host)?.stage;
    return stage ? { stage, ...targetOf(appId, query) } : null;
};

export const readSubWebViewLinkPath = (path: string): SubWebViewAppLinkTarget | null => {
    const match = LINK_PATH.exec(path);
    return match ? targetOf(match[1], match[2]) : null;
};

export const subWebViewLinkPath = ({ appId, query }: SubWebViewAppLinkTarget): string =>
    `${SUB_WEBVIEW_APP_LINK_PREFIX}${appId}${query}`;

export const subWebViewAppLinkOfId = (appId: string, stage: SubWebViewStage): string => {
    const host = HOSTS.find(entry => entry.stage === stage)?.app ?? HOSTS[0].app;
    return `https://${host}/apps/${appId}`;
};

export const subWebViewAppLinkOfOrigin = (origin: string): string | null => {
    const match = PAGE_ORIGIN.exec(origin);
    if (!match) return null;
    const [, label, pages] = match;
    const app = HOSTS.find(entry => entry.pages === pages)?.app;
    return app ? `https://${app}/apps/${label}` : null;
};

export const isSubWebViewAppLinkAttempt = (link: string): boolean => {
    const match = APP_LINK_ATTEMPT.exec(link);
    return !!match && HOSTS.some(entry => entry.app === match[1]);
};

export const isSubWebViewPageUrl = (url: string): boolean => {
    const origin = URL_ORIGIN.exec(url)?.[1];
    return !!origin && subWebViewAppLinkOfOrigin(origin) !== null;
};

export const subWebViewPageUrlOfNavigatePath = (path: string): string | null => {
    const match = /^\/sub-webview\?(?:[^#]*?&)??url=([^&#]*)/.exec(path);
    if (!match) return null;
    try {
        const url = decodeURIComponent(match[1]);
        return isSubWebViewPageUrl(url) ? url : null;
    } catch {
        return null;
    }
};
