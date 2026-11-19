import { logger } from '@chatic/bridges';
import {
    readSubWebViewAppLink,
    subWebViewAppLinkOfOrigin,
    type SubWebViewAppLinkTarget,
    type SubWebViewStage,
} from '@chatic/shared';

import { isDevBuild } from '../utils/buildEnv';
import { openSubWebView } from './subWebView';
import { resolveSubWebViewAppUrl } from './subWebViewApps';

/**
 * A mini app page a link names: an app, by id, which this web resolves to where it is hosted, or a
 * page's own URL, which is opened as it is.
 */
export type SubWebViewLinkTarget = { link: SubWebViewAppLinkTarget } | { pageUrl: string };

/** This build's stage: which page domain and which list of apps it opens. */
const buildStage = (): SubWebViewStage => (isDevBuild() ? 'dev' : 'prod');

// Scheme and host, up to the first `/`, `?` or `#`; the shared helpers read an origin, not a URL.
const URL_ORIGIN = /^(https:\/\/[^/?#]+)(?=$|[/?#])/;

/** The stage of the page domain a page's own address is on, or `null` when it is no page's address. */
const pageStageOf = (url: string): SubWebViewStage | null => {
    const origin = URL_ORIGIN.exec(url)?.[1];
    const appLink = origin ? subWebViewAppLinkOfOrigin(origin) : null;
    return appLink ? (readSubWebViewAppLink(appLink)?.stage ?? null) : null;
};

/**
 * The mini app page a URL tapped inside the app names, or `null` for any other URL.
 *
 * Two shapes count. An app link (`https://app.chatic.io/apps/<appId>?<query>`, or its development
 * host) is what a page shares to be opened in the app; it names an app, which is resolved for this
 * build's stage whichever host the link is on. A page's own address (`https://<label>.apps.chatic.io/…`)
 * is not a link the OS hands the app, but it is still a page this app can show — a message sent before
 * its page shared the app link carries one. It counts only on this build's own page domain: a page of
 * the other stage would run against this build's session, so it goes to the OS like any other site.
 */
export const subWebViewTargetOfUrl = (url: string): SubWebViewLinkTarget | null => {
    const appLink = readSubWebViewAppLink(url);
    if (appLink) return { link: { appId: appLink.appId, query: appLink.query } };
    return pageStageOf(url) === buildStage() ? { pageUrl: url } : null;
};

/**
 * How opening a target went: shown in the sub WebView, refused by the shell (logged), or not opened at
 * all because the link names an app this stage does not know (logged).
 */
export type SubWebViewTargetOpening = 'opened' | 'refused' | 'unknownApp';

/**
 * Opens a mini app page over whatever is showing. The caller has already checked that the shell has
 * the sub WebView: `openSubWebView` would otherwise hand the page to the OS browser, which is the
 * caller's to decide — and so is what an unknown app id leads to.
 */
export const openSubWebViewTarget = async (target: SubWebViewLinkTarget): Promise<SubWebViewTargetOpening> => {
    const link = 'link' in target ? target.link : null;
    const pageUrl = 'link' in target ? await resolveSubWebViewAppUrl(target.link, buildStage()) : target.pageUrl;
    if (!pageUrl) {
        logger.warn('router.sub_webview_app_unknown', 'Sub WebView link names no known app', {
            appId: link?.appId,
        });
        return 'unknownApp';
    }
    try {
        await openSubWebView({ url: pageUrl, ...(link ? { appId: link.appId } : {}) });
        return 'opened';
    } catch (error) {
        logger.warn('router.sub_webview_link_refused', 'Sub WebView link not opened', { pageUrl, error });
        return 'refused';
    }
};
