import { subWebViewOriginOf } from '@chatic/mini-app-protocol';

export type SubWebViewNavigationDecision = 'load' | 'external' | 'block';

const EXTERNAL_SCHEMES: readonly string[] = ['https', 'http', 'mailto', 'tel', 'sms', 'itms-apps', 'market'];

const FRAME_SCHEMES: readonly string[] = ['https', 'about', 'data', 'blob'];

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const AMBIGUOUS_WEB_URL = /^https?:\/\/[^/?#]*@|[\\\s\u0000-\u001f\u007f]/i;

const DEEP_LINK_PATTERN = /^https?:\/\/app(?:-dev)?\.chatic\.io\.?(?::\d*)?\/(?:i|s)(?:[/?#]|$)/i;

const schemeOf = (url: string) => /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase();

export const decideSubWebViewNavigation = (
    request: { url: string; isTopFrame?: boolean },
    openedOrigin: string | null
): SubWebViewNavigationDecision => {
    const { url } = request;
    const scheme = schemeOf(url);
    if (request.isTopFrame === false) return scheme && FRAME_SCHEMES.includes(scheme) ? 'load' : 'block';

    if (url === 'about:blank' || (openedOrigin !== null && subWebViewOriginOf(url) === openedOrigin)) return 'load';
    if ((scheme === 'https' || scheme === 'http') && AMBIGUOUS_WEB_URL.test(url)) return 'block';
    if (DEEP_LINK_PATTERN.test(url)) return 'block';
    return scheme && EXTERNAL_SCHEMES.includes(scheme) ? 'external' : 'block';
};
