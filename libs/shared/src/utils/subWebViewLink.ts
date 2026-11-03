/**
 * The app link for a sub WebView page, both ways. One module so landing, mobile and the web agree on
 * which page a link opens: `https://app.chatic.io/apps/<label>/<path>` opens
 * `https://<label>.apps.chatic.io/<path>`, and the `app-dev` host opens the `apps-dev` one.
 *
 * Parsed by hand rather than with `URL`: React Native's `URL` keeps userinfo and reads `search` off
 * the raw string, and Jest runs Node's instead, so a check built on it would pass its tests and
 * behave differently on a device.
 */

/** Each app-link host and the page domain its links open, by stage. */
const HOSTS: readonly { stage: SubWebViewStage; app: string; pages: string }[] = [
    { stage: 'prod', app: 'app.chatic.io', pages: 'apps.chatic.io' },
    { stage: 'dev', app: 'app-dev.chatic.io', pages: 'apps-dev.chatic.io' },
];

/** Which pair of hosts a build belongs to. */
export type SubWebViewStage = 'prod' | 'dev';

/** The path under the app-link host that carries a page's label. */
export const SUB_WEBVIEW_APP_LINK_PREFIX = '/apps/';

/**
 * The web path the shell hands the web, in `OnNavigate`, for a page link: the web opens the page in a
 * sub WebView instead of routing. The page's URL rides as `url`, encoded.
 */
export const SUB_WEBVIEW_NAVIGATE_PATH = '/sub-webview';

// One DNS label: lower-case letters, digits and inner hyphens, as the allowlist accepts.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const APP_LINK = new RegExp(`^https://([^/?#]+)/apps/(${LABEL})(?=$|[/?#])(.*)$`);
const APP_LINK_ATTEMPT = /^https:\/\/([^/?#]+)\/apps(?=$|[/?#])/;
const LINK_PATH = new RegExp(`^/apps/(${LABEL})(?=$|[/?#])(.*)$`);
const PAGE_ORIGIN = new RegExp(`^https://(${LABEL})\\.([^/?#:@]+)$`);
const URL_ORIGIN = /^(https:\/\/[^/?#]+)(?=$|[/?#])/;

/**
 * The page an app link opens, or `null` for anything else. The rest of the link after the label —
 * path, query, fragment — is kept as the page's own. A link with userinfo, a port or upper case in
 * the host is not an app link.
 */
export const subWebViewPageUrlOfAppLink = (link: string): string | null => {
    const match = APP_LINK.exec(link);
    if (!match) return null;
    const [, host, label, rest] = match;
    const pages = HOSTS.find(entry => entry.app === host)?.pages;
    if (!pages) return null;
    return `https://${label}.${pages}${rest.startsWith('/') ? rest : `/${rest}`}`;
};

/** The app link that opens the page on `origin` (`https://<label>.apps.chatic.io`), or `null`. */
export const subWebViewAppLinkOfOrigin = (origin: string): string | null => {
    const match = PAGE_ORIGIN.exec(origin);
    if (!match) return null;
    const [, label, pages] = match;
    const app = HOSTS.find(entry => entry.pages === pages)?.app;
    return app ? `https://${app}/apps/${label}` : null;
};

/**
 * Whether `link` is on an app-link host under `/apps` at all — mapped or not. A claimed link that
 * does not map (`/apps/Quiz`, `/apps/`) is a broken page link, not a route of the web app.
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

/** The `OnNavigate` path that asks the web to open `pageUrl` in a sub WebView. */
export const subWebViewNavigatePath = (pageUrl: string): string =>
    `${SUB_WEBVIEW_NAVIGATE_PATH}?url=${encodeURIComponent(pageUrl)}`;

/**
 * The page an `OnNavigate` path asks the web to open, or `null` when the path is an ordinary route.
 * Only the exact path counts, so a route that merely starts with it is left alone, and only a page
 * on a sub WebView origin: the path can arrive through the app's custom scheme from any website, and
 * an older app would hand anything else to the OS browser. The first `url` counts, as
 * `URLSearchParams` would read it.
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

/**
 * The page a web path asks to open: the `/sub-webview?url=…` path an app hands over, or — from an
 * app that predates it and passes the link's path through unchanged — `/apps/<label>/…`, mapped with
 * the web build's own stage, since the link's host is gone by then. `null` for an ordinary route.
 */
export const subWebViewPageUrlOfWebPath = (path: string, stage: SubWebViewStage): string | null => {
    const fromNavigate = subWebViewPageUrlOfNavigatePath(path);
    if (fromNavigate) return fromNavigate;
    const match = LINK_PATH.exec(path);
    if (!match) return null;
    const [, label, rest] = match;
    const pages = HOSTS.find(entry => entry.stage === stage)?.pages;
    return pages ? `https://${label}.${pages}${rest.startsWith('/') ? rest : `/${rest}`}` : null;
};
