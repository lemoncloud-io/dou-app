import type { IAppBridgeHost } from '@chatic/bridges';
import { useEffect, useMemo } from 'react';
import { FileManagerBridge, TransferManagerBridge } from '../../bridge';
import { useServices } from '../../hooks';
import { createFileTransferHandlers } from './fileTransferHandlers';

export const useFileTransferHandler = (bridge: IAppBridgeHost) => {
    const { logService: logger } = useServices();
    const handlers = useMemo(
        () => createFileTransferHandlers(bridge, TransferManagerBridge, FileManagerBridge, logger),
        [bridge, logger]
    );

    // State events reach the WebView only while the router is mounted; anything missed meanwhile
    // stays in the native registry and is read back with ListFileTransfers.
    useEffect(() => handlers.relayStateEvents(), [handlers]);

    return handlers;
};
