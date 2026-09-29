import { isNative, logger, webClient } from '@chatic/bridges';
import type { PutPort } from '@chatic/data';

import { createNativeTransfers, syncFileTransfers, xhrPut, type NativeTransfers } from '../runtime/upload';

// One per page, on purpose: the old-shell verdict ("no transfer module, use page uploads") holds for
// the page's whole life, and every waiting upload has to be reachable from the one event listener.
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

/** Catches up with transfers the shell finished while this page was away. A browser has none. */
export const syncShellTransfers = (): Promise<void> =>
    isNative() ? syncFileTransfers(webClient, getNativeTransfers()) : Promise.resolve();
