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
 */
export const openSubWebView = async ({ url, title }: { url: string; title?: string }): Promise<SubWebViewOpening> => {
    if (!isNative()) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return { via: 'browser' };
    }
    if (!shellCapabilities.supports('OpenSubWebView')) {
        appBridge.openURL(url);
        return { via: 'external' };
    }
    const response = await appBridge.openSubWebView(url, title);
    return { via: 'subWebView', viewId: response.data.viewId };
};
