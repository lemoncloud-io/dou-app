import type { SubWebViewParams } from '@chatic/app-messages';
import { isNative } from '@chatic/bridges';

import { appBridge } from './appBridge';
import { shellCapabilities } from './shellCapabilities';

/**
 * Where a page asked for with `openSubWebView` went: the app's sub WebView, the OS browser (an app
 * built before the sub WebView), or a new browser tab (no app at all).
 */
export type SubWebViewOpening = { via: 'subWebView'; viewId: string } | { via: 'external' } | { via: 'browser' };

/**
 * Show a page on another origin without leaving the app, as far as the app it runs in allows.
 *
 * The shell is asked only when its handshake listed `OpenSubWebView`, so an older app never meets a
 * request it would answer `NOT_FOUND`; it hands the page to the OS browser instead, as `openURL`
 * always has. A refusal from a shell that has it (`NOT_ALLOWED`, `ALREADY_OPEN`) is not turned into
 * that fallback — it rejects, because it means this page asked for something the app will not show.
 *
 * `params` reach the page only in the sub WebView, as `window.ChaticSubWebView.params`. The two
 * fallbacks cannot carry them, so a page must also work without them — or the caller should not fall
 * back, which `via` lets it decide after the fact.
 */
export const openSubWebView = async ({
    url,
    title,
    params,
}: {
    url: string;
    title?: string;
    params?: SubWebViewParams;
}): Promise<SubWebViewOpening> => {
    if (!isNative()) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return { via: 'browser' };
    }
    if (!shellCapabilities.supports('OpenSubWebView')) {
        appBridge.openURL(url);
        return { via: 'external' };
    }
    const response = await appBridge.openSubWebView(url, title, params);
    return { via: 'subWebView', viewId: response.data.viewId };
};
