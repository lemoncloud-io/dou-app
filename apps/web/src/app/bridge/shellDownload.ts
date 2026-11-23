import { useEffect } from 'react';

import { logger, webClient } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

import { createNativeDownloads, type NativeDownloads } from '../runtime/transfer';
import { shellCapabilities, useCanExportImages } from './shellCapabilities';
import { useAppForeground } from './useAppForeground';

let nativeDownloads: NativeDownloads | null = null;

export const getShellDownloads = (): NativeDownloads => {
    nativeDownloads ??= createNativeDownloads({
        bridge: webClient,
        log: (message, data) => logger.info('DOWNLOAD', message, data),
    });
    return nativeDownloads;
};

let syncing: Promise<void> | null = null;

const shellMayHoldDownloads = (): boolean => runtime.files.transfers !== null || shellCapabilities.canExportImages();

export const syncShellDownloads = (): Promise<void> => {
    if (!shellMayHoldDownloads()) return Promise.resolve();
    syncing ??= getShellDownloads()
        .sync()
        .finally(() => {
            syncing = null;
        });
    return syncing;
};

export const useShellDownloadCatchUp = (): void => {
    const canExport = useCanExportImages();
    useAppForeground(() => {
        if (canExport) void syncShellDownloads();
    });
    useEffect(() => {
        if (canExport) void syncShellDownloads();
    }, [canExport]);
};
