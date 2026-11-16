import type { SubWebViewContext, WebMessageType } from '@chatic/bridge-messages';
import { AppBridgeHost, type IAppBridgeHost } from '@chatic/bridges';

import { SUB_WEBVIEW_MESSAGE_LIMIT } from '../services/subWebView/subWebViewData';
import type { SubBridgeHandlers } from './subBridgeHandlers';
import type { SubWebViewRuntimeHandlers } from './subWebViewRuntimeBridge';

/**
 * The sub WebView's own host. Built with no cache schema, no cache types and no `onAppReady`, so its
 * handshake reports no local storage and drives none of the main WebView's boot. It does report the
 * page's context, which the global cannot promise to have defined in time on Android, and refuses a
 * message over the page's size limit. It registers the page-facing handlers it is given — the base
 * set, what the page's manifest permits, and the runtime requests where the gate opened them — and
 * nothing else — `WebAppReady` and `Ping` it answers itself — so its handshake lists exactly the subset.
 */
export const createSubBridgeHost = (
    sendToWeb: (message: string) => void,
    handlers: Partial<SubBridgeHandlers> & Partial<SubWebViewRuntimeHandlers>,
    getContext: () => SubWebViewContext
): IAppBridgeHost => {
    const host = new AppBridgeHost({
        sendToWeb,
        subWebViewContext: getContext,
        maxMessageLength: SUB_WEBVIEW_MESSAGE_LIMIT,
    });
    for (const type of Object.keys(handlers) as Array<keyof (SubBridgeHandlers & SubWebViewRuntimeHandlers)>) {
        // The table's own type pins each handler to its request; the host's signature is per-call.
        host.registerHandler(type as WebMessageType, handlers[type] as never);
    }
    return host;
};
