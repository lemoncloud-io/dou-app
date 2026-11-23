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

export type SubWebViewLinkTarget = { link: SubWebViewAppLinkTarget } | { pageUrl: string };

const buildStage = (): SubWebViewStage => (isDevBuild() ? 'dev' : 'prod');

const URL_ORIGIN = /^(https:\/\/[^/?#]+)(?=$|[/?#])/;

const pageStageOf = (url: string): SubWebViewStage | null => {
    const origin = URL_ORIGIN.exec(url)?.[1];
    const appLink = origin ? subWebViewAppLinkOfOrigin(origin) : null;
    return appLink ? (readSubWebViewAppLink(appLink)?.stage ?? null) : null;
};

export const subWebViewTargetOfUrl = (url: string): SubWebViewLinkTarget | null => {
    const appLink = readSubWebViewAppLink(url);
    if (appLink) return { link: { appId: appLink.appId, query: appLink.query } };
    return pageStageOf(url) === buildStage() ? { pageUrl: url } : null;
};

export type SubWebViewTargetOpening = 'opened' | 'refused' | 'unknownApp';

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
