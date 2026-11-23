import { logger, webClient } from '@chatic/bridges';
import { filesAdapters } from '@chatic/runtime-web';
import type { FilesPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';
import { createNativeTransfers, syncFileTransfers, type NativeTransfers } from '../../app/runtime/upload';
import { pageUploadPut } from '../upload';

export const SHELL_USE_TIMEOUT_MS = 10 * 60_000;

let nativeTransfers: NativeTransfers | null = null;

const getNativeTransfers = (): NativeTransfers => {
    nativeTransfers ??= createNativeTransfers({
        bridge: webClient,
        fallback: pageUploadPut,
        log: (message, data) => logger.info('UPLOAD', message, data),
    });
    return nativeTransfers;
};

export const resetNativeTransfersForTest = (): void => {
    nativeTransfers?.dispose();
    nativeTransfers = null;
};

export const webFiles: ShellOrBrowserImplementations<'files'> = {
    shell: (base): FilesPort => ({
        ...base,
        put: (target, file, label, onProgress, signal) =>
            getNativeTransfers().put(target, file, label, onProgress, signal),
        transfers: {
            putShellFile: (target, file, label, onProgress) =>
                getNativeTransfers().putShellFile(target, file, label, onProgress),
            syncUploads: () => syncFileTransfers(webClient, getNativeTransfers()),
            openFile: async uri => {
                await webClient.request({ type: 'OpenFile', data: { uri } }, { timeoutMs: SHELL_USE_TIMEOUT_MS });
            },
            saveFile: async (uri, name) =>
                (
                    await webClient.request(
                        { type: 'SaveFile', data: { uri, name } },
                        { timeoutMs: SHELL_USE_TIMEOUT_MS }
                    )
                )?.data,
            readVideoFrame: async request => (await appBridge.readVideoFrame(request)).data,
        },
    }),
    browser: (base): FilesPort => ({ ...base, put: pageUploadPut, transfers: null }),
};

export const { host: filesHost, shell: filesShell, browser: filesBrowser } = filesAdapters(webFiles);
