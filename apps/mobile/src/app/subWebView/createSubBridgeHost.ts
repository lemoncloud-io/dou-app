import type { SubWebViewContext, WebMessageType } from '@chatic/bridge-messages';
import { AppBridgeHost, type IAppBridgeHost } from '@chatic/bridges';

import { SUB_WEBVIEW_MESSAGE_LIMIT } from '../services/subWebView/subWebViewData';
import type { SubBridgeHandlers } from './subBridgeHandlers';
import type { SubWebViewRuntimeHandlers } from './subWebViewRuntimeBridge';

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
        host.registerHandler(type as WebMessageType, handlers[type] as never);
    }
    return host;
};
