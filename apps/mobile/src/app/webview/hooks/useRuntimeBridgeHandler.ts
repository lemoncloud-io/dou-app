import { useEffect } from 'react';

import type { WebMessageType } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

import { launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import type * as RuntimeBridgeModule from '../../services/runtime/runtimeBridge';

/**
 * Answers the page's runtime requests (`RuntimeHello`, `RuntimeCall`, `RuntimeSubscribe`,
 * `RuntimeUnsubscribe`) on a launch the app's runtime owns. On any other launch it registers nothing:
 * the requests then answer `NOT_FOUND`, which a page reads as "the session is mine" — and since that
 * launch offered nothing, a page does not ask anyway.
 *
 * The runtime is loaded here, when the WebView's bridge is set up, and only on such a launch; it starts
 * at the page's first hello.
 */
export const useRuntimeBridgeHandler = (bridge: IAppBridgeHost): void => {
    useEffect(() => {
        if (launchSessionOwner() !== 'native') return undefined;
        const { createAppRuntimeBridge } =
            require('../../services/runtime/runtimeBridge') as typeof RuntimeBridgeModule;
        const runtimeBridge = createAppRuntimeBridge(bridge);
        const types = Object.keys(runtimeBridge.handlers) as (keyof typeof runtimeBridge.handlers)[];
        types.forEach(type => bridge.registerHandler(type, runtimeBridge.handlers[type] as never));
        return () => {
            types.forEach(type => bridge.unregisterHandler(type as WebMessageType));
            runtimeBridge.dispose();
        };
    }, [bridge]);
};
