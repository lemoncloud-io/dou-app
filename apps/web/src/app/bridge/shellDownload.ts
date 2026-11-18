import { useEffect } from 'react';

import { logger, webClient } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

import { createNativeDownloads, type NativeDownloads } from '../runtime/transfer';
import { shellCapabilities, useCanExportImages } from './shellCapabilities';
import { useAppForeground } from './useAppForeground';

// One per page, like the upload registry: every waiting download has to be reachable from the one
// event listener, and the catch-up after a return has to see all of them.
let nativeDownloads: NativeDownloads | null = null;

/** The shell's download registry for this page. Only meaningful where the app moves files. */
export const getShellDownloads = (): NativeDownloads => {
    nativeDownloads ??= createNativeDownloads({
        bridge: webClient,
        log: (message, data) => logger.info('DOWNLOAD', message, data),
    });
    return nativeDownloads;
};

let syncing: Promise<void> | null = null;

/**
 * Whether the shell can hold a download for this page. Two features start them through the one
 * registry: a document download where the app moves files (the host's `files` port), and saving or
 * sharing a photo or video wherever the handshake allows image export. Either is reason to catch up.
 */
const shellMayHoldDownloads = (): boolean => runtime.files.kind === 'shell' || shellCapabilities.canExportImages();

/**
 * Catches up with downloads the shell finished while this page was away. Where the shell can hold none
 * there are none. Calls that overlap share one list request.
 */
export const syncShellDownloads = (): Promise<void> => {
    if (!shellMayHoldDownloads()) return Promise.resolve();
    syncing ??= getShellDownloads()
        .sync()
        .finally(() => {
            syncing = null;
        });
    return syncing;
};

/**
 * The page's one download catch-up: once the handshake allows image export — which also clears what
 * a page before a reload left behind — and on every return to the front, when a save may have
 * finished in the background. Mounted once, in `GlobalBridgeListener`.
 */
export const useShellDownloadCatchUp = (): void => {
    const canExport = useCanExportImages();
    useAppForeground(() => {
        if (canExport) void syncShellDownloads();
    });
    useEffect(() => {
        if (canExport) void syncShellDownloads();
    }, [canExport]);
};
