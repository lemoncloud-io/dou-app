import { logger, webClient } from '@chatic/bridges';
import { browserFiles } from '@chatic/host-web-browser';
import { mobileShellFiles } from '@chatic/host-web-mobile-shell';
import { filesAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

import { createNativeTransfers, syncFileTransfers, type NativeTransfers } from '../../app/runtime/upload';
import { pageUploadPut } from '../upload';

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
    shell: mobileShellFiles({
        bridge: webClient,
        sender: getNativeTransfers,
        syncUploads: () => syncFileTransfers(webClient, getNativeTransfers()),
    }),
    browser: browserFiles(pageUploadPut),
};

export const { host: filesHost, shell: filesShell, browser: filesBrowser } = filesAdapters(webFiles);
