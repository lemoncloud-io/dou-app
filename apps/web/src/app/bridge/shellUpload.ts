import { isNative, logger, webClient } from '@chatic/bridges';
import { type PutPort, type ShellFilePutPort } from '@chatic/data';
import { xhrPut } from '@chatic/runtime-web';

import { createNativeTransfers, syncFileTransfers, type NativeTransfers } from '../runtime/upload';

// One per page, on purpose: every waiting upload has to be reachable from the one event listener.
let nativeTransfers: NativeTransfers | null = null;

const getNativeTransfers = (): NativeTransfers => {
    nativeTransfers ??= createNativeTransfers({
        bridge: webClient,
        fallback: xhrPut,
        log: (message, data) => logger.info('UPLOAD', message, data),
    });
    return nativeTransfers;
};

/** The PUT this shell uses: the native transfer module inside the app, the page's own PUT in a browser. */
export const getShellPut = (): PutPort => (isNative() ? getNativeTransfers().put : xhrPut);

/**
 * How this shell sends a file it keeps: through the transfer module, from the shell's own folder. A
 * browser never has shell files, so it has no such sender.
 */
export const getShellFilePut = (): ShellFilePutPort | undefined =>
    isNative() ? getNativeTransfers().putShellFile : undefined;

/** Catches up with transfers the shell finished while this page was away. A browser has none. */
export const syncShellTransfers = (): Promise<void> =>
    isNative() ? syncFileTransfers(webClient, getNativeTransfers()) : Promise.resolve();
