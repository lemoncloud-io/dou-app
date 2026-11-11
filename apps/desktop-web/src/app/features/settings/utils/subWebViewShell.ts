import type {
    OnSubWebViewClosedPayload,
    OnWebAppReadyPayload,
    SubWebViewOpenScope,
    SubWebViewParams,
} from '@chatic/bridge-messages';
import { isNative, logger, webClient } from '@chatic/bridges';

/**
 * How far the shell opens sub views, from its handshake, or `null` when it says nothing: a plain
 * browser, a shell built before the sub view, or a failed handshake. Only `anyHttps` lets the web offer
 * a link an owner registered; the web ships before the shell, so it asks rather than assumes.
 *
 * desktop-web sends no handshake at startup; this one is asked for here alone, and the desktop host
 * answers it without side effects.
 */
export const readSubWebViewOpenScope = async (): Promise<SubWebViewOpenScope | null> => {
    if (!isNative()) return null;
    try {
        const response = await webClient.request({ type: 'WebAppReady', data: {} });
        return (response?.data as OnWebAppReadyPayload | undefined)?.subWebViewOpenScope ?? null;
    } catch (error) {
        // Still "not offered", but a failed handshake is not a shell that said no: it leaves a trace.
        logger.warn('BRIDGE', 'sub view handshake failed', { error });
        return null;
    }
};

/** Show `url` in the shell's sub view. Resolves with its `viewId`; rejects with the shell's refusal. */
export const openShellSubWebView = async (url: string, params: SubWebViewParams): Promise<string> => {
    const response = await webClient.request({ type: 'OpenSubWebView', data: { url, params } });
    const viewId = response.data?.viewId;
    if (!viewId) throw new Error('OpenSubWebView answered without a viewId');
    return viewId;
};

/** Hear every sub view that closes, with the page's `result`. Returns the unsubscribe. */
export const onShellSubWebViewClosed = (listener: (closed: OnSubWebViewClosedPayload) => void): (() => void) =>
    webClient.onEvent('OnSubWebViewClosed', message => listener(message.data));
