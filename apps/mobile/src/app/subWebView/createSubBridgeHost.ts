import type { WebMessageType } from '@chatic/app-messages';
import { AppBridgeHost, type IAppBridgeHost } from '@chatic/bridges';

import type { SubBridgeHandlers } from './subBridgeHandlers';

/**
 * The sub WebView's own host. Built with nothing but a way to send: no cache schema, no cache types,
 * no `onAppReady`, so its handshake reports no local storage and drives none of the main WebView's
 * boot. It registers the page-facing handlers and nothing else — `WebAppReady` and `Ping` it answers
 * itself — so its handshake lists exactly the subset.
 */
export const createSubBridgeHost = (
    sendToWeb: (message: string) => void,
    handlers: SubBridgeHandlers
): IAppBridgeHost => {
    const host = new AppBridgeHost({ sendToWeb });
    for (const type of Object.keys(handlers) as Array<keyof SubBridgeHandlers>) {
        // The table's own type pins each handler to its request; the host's signature is per-call.
        host.registerHandler(type as WebMessageType, handlers[type] as never);
    }
    return host;
};
