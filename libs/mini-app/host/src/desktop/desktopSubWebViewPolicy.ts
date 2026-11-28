import type { SubWebViewDisplay, SubWebViewErrorCode, SubWebViewOpenScope } from '@chatic/bridge-messages';
import {
    isSubWebViewAppId,
    isSubWebViewParams,
    SUB_WEBVIEW_TITLE_LIMIT,
    subWebViewDisplayOf,
    subWebViewOriginOf,
    type SubWebViewTrust,
    subWebViewTrustOf,
} from '@chatic/mini-app-protocol';

export const DESKTOP_SUB_WEBVIEW_OPEN_SCOPE: SubWebViewOpenScope = 'anyHttps';

export type DesktopSubWebViewOpenCheck =
    | {
          ok: true;
          url: string;
          origin: string;
          trust: SubWebViewTrust;
          title?: string;
          params: Record<string, unknown>;
      }
    | { ok: false; code: Extract<SubWebViewErrorCode, 'INVALID' | 'NOT_ALLOWED'> };

export const checkDesktopSubWebViewOpen = (request: {
    url: unknown;
    title?: unknown;
    params?: unknown;
    appId?: unknown;
}): DesktopSubWebViewOpenCheck => {
    const { url, title, params, appId } = request;
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return { ok: false, code: 'INVALID' };
    if (title !== undefined && typeof title !== 'string') return { ok: false, code: 'INVALID' };
    if (params !== undefined && !isSubWebViewParams(params)) return { ok: false, code: 'INVALID' };
    if (appId !== undefined && !isSubWebViewAppId(appId)) return { ok: false, code: 'INVALID' };
    const trust = subWebViewTrustOf(url);
    const origin = subWebViewOriginOf(url);
    if (!trust || !origin) return { ok: false, code: 'NOT_ALLOWED' };
    return { ok: true, url, origin, trust, ...(title ? { title } : {}), params: params ?? {} };
};

export type DesktopSubWebViewNavigation = 'load' | 'external' | 'block';

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const AMBIGUOUS_WEB_URL = /^https?:\/\/[^/?#]*@|[\\\s\u0000-\u001f\u007f]/i;

const DEEP_LINK_PATTERN = /^https?:\/\/app(?:-dev)?\.chatic\.io\.?(?::\d*)?\/(?:i|s)(?:[/?#]|$)/i;

export const decideDesktopSubWebViewNavigation = (url: string, openedOrigin: string): DesktopSubWebViewNavigation => {
    if (url === 'about:blank') return 'load';
    if (AMBIGUOUS_WEB_URL.test(url)) return 'block';
    const origin = subWebViewOriginOf(url);
    if (origin === openedOrigin) return 'load';
    if (DEEP_LINK_PATTERN.test(url)) return 'block';
    return origin ? 'external' : 'block';
};

const FRAME_SCHEMES: readonly string[] = ['https', 'about', 'data', 'blob'];

export const allowsSubWebViewFrame = (url: string): boolean => {
    const scheme = /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase();
    return !!scheme && FRAME_SCHEMES.includes(scheme);
};

export const acceptsSubWebViewMessage = (
    sender: { url: string | undefined; isMainFrame: boolean },
    openedOrigin: string
): boolean => sender.isMainFrame && !!sender.url && subWebViewOriginOf(sender.url) === openedOrigin;

export const readDesktopSubWebViewManifest = (json: unknown): { name?: string; display?: SubWebViewDisplay } => {
    if (!json || typeof json !== 'object' || (json as { manifestVersion?: unknown }).manifestVersion !== 1) return {};
    const { name, display: declared } = json as { name?: unknown; display?: unknown };
    const display = subWebViewDisplayOf(declared);
    return {
        ...(typeof name === 'string' && name.trim() && name.length <= SUB_WEBVIEW_TITLE_LIMIT
            ? { name: name.trim() }
            : {}),
        ...(display ? { display: display === 'immersive' ? ('clean' as const) : display } : {}),
    };
};

export const fetchesManifest = (trust: SubWebViewTrust): boolean => trust !== 'external';

export const displayOf = (trust: SubWebViewTrust, manifest: { display?: SubWebViewDisplay }): SubWebViewDisplay =>
    trust === 'external' ? 'titled' : (manifest.display ?? 'titled');

export const barTitleOf = (
    view: { trust: SubWebViewTrust; origin: string; title?: string },
    shown: { requested?: string; document?: string; manifestName?: string }
): string => {
    const host = view.origin.replace(/^https:\/\//, '');
    if (view.trust === 'external') return host;
    const pick = [shown.requested, shown.document, view.title, shown.manifestName].find(
        title => typeof title === 'string' && title.trim()
    );
    return pick ? pick.trim().slice(0, SUB_WEBVIEW_TITLE_LIMIT) : host;
};
