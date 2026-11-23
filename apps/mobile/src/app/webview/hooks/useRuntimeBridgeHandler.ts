import { useEffect } from 'react';

import type { WebMessageType } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

import { launchSessionOwner } from '../../services/runtime/launchSessionOwner';
import type * as RuntimeBridgeModule from '../../services/runtime/runtimeBridge';

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
