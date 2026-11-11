/**
 * The app link for a sub WebView page: `https://app.chatic.io/apps/<appId>?<query>`. One module so
 * landing, mobile and the web read a link the same way.
 *
 * The link names an app, not a page: which URL an app id opens is the web's to resolve, from a list it
 * keeps and later from the server, so a page can move — to another domain included — without its
 * links changing. Nothing here maps an id to a URL.
 *
 * The link carries an id and a query and nothing else — no path, no fragment. A page is entered at its
 * root and reads what it needs from the query, so it works on any static host without a rewrite for
 * deep paths, and a reviewer reads one entrance per page.
 *
 * Parsed by hand rather than with `URL`: React Native's `URL` keeps userinfo and reads `search` off
 * the raw string, and Jest runs Node's instead, so a check built on it would pass its tests and
 * behave differently on a device.
 */

/** Each app-link host and the page domain of the same stage. */
const HOSTS: readonly { stage: SubWebViewStage; app: string; pages: string }[] = [
    { stage: 'prod', app: 'app.chatic.io', pages: 'apps.chatic.io' },
    { stage: 'dev', app: 'app-dev.chatic.io', pages: 'apps-dev.chatic.io' },
];

/** Which pair of hosts a build belongs to. */
export type SubWebViewStage = 'prod' | 'dev';

/** The path under the app-link host that carries an app id. */
export const SUB_WEBVIEW_APP_LINK_PREFIX = '/apps/';

/**
 * The web path an app built before app ids handed the web for a page link, with the page's URL as
 * `url`. The web still reads it, for those apps.
 */
export const SUB_WEBVIEW_NAVIGATE_PATH = '/sub-webview';

/** What a page link names: the app, and the query its page is opened with (`''` or `?…`). */
export interface SubWebViewAppLinkTarget {
    appId: string;
    query: string;
}

// One DNS label: lower-case letters, digits and inner hyphens. An app id has the same shape, so an
// id can be a page's label where the two agree, and case never decides which app a link opens.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
// After the id: an optional slash, then an optional query, then the end — no path and no fragment.
const LINK_REST = '/?(\\?[^#]*)?$';
const APP_LINK = new RegExp(`^https://([^/?#]+)/apps/(${LABEL})${LINK_REST}`);
const APP_LINK_ATTEMPT = /^https:\/\/([^/?#]+)\/apps(?=$|[/?#])/;
const LINK_PATH = new RegExp(`^/apps/(${LABEL})${LINK_REST}`);
const PAGE_ORIGIN = new RegExp(`^https://(${LABEL})\\.([^/?#:@]+)$`);
const URL_ORIGIN = /^(https:\/\/[^/?#]+)(?=$|[/?#])/;

// A bare `?` carries nothing, so it reads as no query at all.
const targetOf = (appId: string, query: string | undefined): SubWebViewAppLinkTarget => ({
    appId,
    query: query && query !== '?' ? query : '',
});

/**
 * Reads an app link: its stage, from the host, and what it names. `null` for anything else — another
 * host, userinfo, a port, an id that is not one label, a path after the id, or a fragment.
 */
export const readSubWebViewAppLink = (link: string): (SubWebViewAppLinkTarget & { stage: SubWebViewStage }) | null => {
    const match = APP_LINK.exec(link);
    if (!match) return null;
    const [, host, appId, query] = match;
    const stage = HOSTS.find(entry => entry.app === host)?.stage;
    return stage ? { stage, ...targetOf(appId, query) } : null;
};

/**
 * Reads the web path a page link reaches the web as, `/apps/<appId>?<query>` — the link's own path,
 * which the app hands over unchanged. `null` for an ordinary route or a malformed page link.
 */
export const readSubWebViewLinkPath = (path: string): SubWebViewAppLinkTarget | null => {
    const match = LINK_PATH.exec(path);
    return match ? targetOf(match[1], match[2]) : null;
};

/** The web path for a page link, as the app hands it to the web: `/apps/<appId>?<query>`. */
export const subWebViewLinkPath = ({ appId, query }: SubWebViewAppLinkTarget): string =>
    `${SUB_WEBVIEW_APP_LINK_PREFIX}${appId}${query}`;

/** The app link that opens `appId` for a build of `stage`. */
export const subWebViewAppLinkOfId = (appId: string, stage: SubWebViewStage): string => {
    const host = HOSTS.find(entry => entry.stage === stage)?.app ?? HOSTS[0].app;
    return `https://${host}/apps/${appId}`;
};

/**
 * The app link for a page on `origin` (`https://<label>.apps.chatic.io`), taking its label for the
 * app id, or `null`. Only for a page opened without an app id, by a web built before app ids: the
 * link is right where the id and the label agree.
 */
export const subWebViewAppLinkOfOrigin = (origin: string): string | null => {
    const match = PAGE_ORIGIN.exec(origin);
    if (!match) return null;
    const [, label, pages] = match;
    const app = HOSTS.find(entry => entry.pages === pages)?.app;
    return app ? `https://${app}/apps/${label}` : null;
};

/**
 * Whether `link` is on an app-link host under `/apps` at all — well formed or not. A claimed link
 * that does not read (`/apps/Quiz`, `/apps/`, `/apps/quiz/level`) is a broken page link, not a route
 * of the web app.
 */
export const isSubWebViewAppLinkAttempt = (link: string): boolean => {
    const match = APP_LINK_ATTEMPT.exec(link);
    return !!match && HOSTS.some(entry => entry.app === match[1]);
};

/** Whether `url` is on a sub WebView page's origin: one label under a page domain, over https. */
export const isSubWebViewPageUrl = (url: string): boolean => {
    const origin = URL_ORIGIN.exec(url)?.[1];
    return !!origin && subWebViewAppLinkOfOrigin(origin) !== null;
};

/**
 * The page an app built before app ids asks the web to open, from its `/sub-webview?url=…` path, or
 * `null` when the path is anything else. Only the exact path counts, so a route that merely starts
 * with it is left alone, and only a page on a sub WebView origin: the path can arrive through the
 * app's custom scheme from any website, and an older app would hand anything else to the OS browser.
 * The first `url` counts, as `URLSearchParams` would read it.
 */
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
