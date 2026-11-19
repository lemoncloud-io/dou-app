import { runtime } from '@chatic/runtime';
import type { OnSubWebViewClosedPayload, SubWebViewOpenScope, SubWebViewParams } from '@chatic/bridge-messages';

/**
 * How far the shell opens sub views, from its handshake, or `null` when it says nothing: a host with no
 * sub view (`runtime.links.subWebView`), such as a plain browser; a shell built before the sub view; or
 * a failed handshake. Only `anyHttps` lets the web offer a link an owner registered; the web ships
 * before the shell, so it asks rather than assumes.
 */
export const readSubWebViewOpenScope = async (): Promise<SubWebViewOpenScope | null> =>
    (await runtime.links.subWebView?.openScope()) ?? null;

/**
 * Show `url` in the shell's sub view. Resolves with its `viewId`; rejects with the shell's refusal, and
 * where the host has no sub view — a caller asks `readSubWebViewOpenScope` first.
 */
export const openShellSubWebView = async (url: string, params: SubWebViewParams): Promise<string> => {
    const { subWebView } = runtime.links;
    if (!subWebView) throw new Error('This host has no sub view');
    return subWebView.open(url, { params });
};

/**
 * Hear every sub view that closes, with the page's `result`. Returns the unsubscribe. A host with no
 * sub view has none to close, so there is nothing to hear and the unsubscribe does nothing.
 */
export const onShellSubWebViewClosed = (listener: (closed: OnSubWebViewClosedPayload) => void): (() => void) =>
    runtime.links.subWebView?.onClosed(listener) ?? (() => undefined);
