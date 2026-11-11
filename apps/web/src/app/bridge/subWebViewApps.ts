import type { SubWebViewAppLinkTarget, SubWebViewStage } from '@chatic/shared';

/**
 * Where each app a page link names is hosted, by stage: the page's origin, which it is opened at the
 * root of. A link names the app (`/apps/<appId>?<query>`) and this list says where it lives, so a page
 * can move without its links changing. Kept here until the server serves the list; the shell's
 * allowlist still decides what may load, so an origin here outside it is refused when opened.
 */
const SUB_WEBVIEW_APPS: Readonly<Record<SubWebViewStage, Readonly<Record<string, string>>>> = {
    prod: {
        'dou-raise': 'https://dou-raise.apps.chatic.io',
    },
    dev: {
        'dou-raise': 'https://dou-raise.apps-dev.chatic.io',
    },
};

/**
 * The page a link opens: the app's origin with the link's query, or `null` for an app this stage does
 * not know. Asynchronous although the list is not yet, so callers are ready for the server's.
 */
export const resolveSubWebViewAppUrl = async (
    { appId, query }: SubWebViewAppLinkTarget,
    stage: SubWebViewStage
): Promise<string | null> => {
    const apps = SUB_WEBVIEW_APPS[stage];
    // Own keys only: an id such as `constructor` must not read through to the prototype.
    const origin = Object.prototype.hasOwnProperty.call(apps, appId) ? apps[appId] : undefined;
    return origin ? `${origin}/${query}` : null;
};

/**
 * DoU's mini app hub for `stage`, opened when a cloud has no link of its own: it greets the user and
 * points an owner to the link setting. The root of the apps domain — the `firstParty` tier — not a
 * page under it.
 */
export const miniAppHubUrl = (stage: SubWebViewStage): string =>
    stage === 'prod' ? 'https://apps.chatic.io/' : 'https://apps-dev.chatic.io/';
