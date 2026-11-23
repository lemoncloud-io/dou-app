import { runtime } from '@chatic/runtime';
import type { OnSubWebViewClosedPayload, SubWebViewOpenScope, SubWebViewParams } from '@chatic/bridge-messages';

export const readSubWebViewOpenScope = async (): Promise<SubWebViewOpenScope | null> =>
    (await runtime.links.subWebView?.openScope()) ?? null;

export const openShellSubWebView = async (url: string, params: SubWebViewParams): Promise<string> => {
    const { subWebView } = runtime.links;
    if (!subWebView) throw new Error('This host has no sub view');
    return subWebView.open(url, { params });
};

export const onShellSubWebViewClosed = (listener: (closed: OnSubWebViewClosedPayload) => void): (() => void) =>
    runtime.links.subWebView?.onClosed(listener) ?? (() => undefined);
