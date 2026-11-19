import { logger, webClient } from '@chatic/bridges';
import { runtime, type PutPort, type ShellFilePutPort } from '@chatic/runtime';

import { pageUploadPut } from '../../config/upload';
import { createNativeTransfers, syncFileTransfers, type NativeTransfers } from '../runtime/upload';

// One per page, on purpose: every waiting upload has to be reachable from the one event listener.
let nativeTransfers: NativeTransfers | null = null;

const getNativeTransfers = (): NativeTransfers => {
    nativeTransfers ??= createNativeTransfers({
        bridge: webClient,
        fallback: pageUploadPut,
        log: (message, data) => logger.info('UPLOAD', message, data),
    });
    return nativeTransfers;
};

/** Whether the app moves files on this host, as the host's `files` port says. */
const appMovesFiles = (): boolean => runtime.files.kind === 'shell';

/** The PUT this host uses: the app's transfer module when the app moves files, the page's own PUT otherwise. */
export const getShellPut = (): PutPort => (appMovesFiles() ? getNativeTransfers().put : pageUploadPut);

/**
 * How this shell sends a file it keeps: through the transfer module, from the shell's own folder. Where
 * the page moves files it never has shell files, so it has no such sender.
 */
export const getShellFilePut = (): ShellFilePutPort | undefined =>
    appMovesFiles() ? getNativeTransfers().putShellFile : undefined;

/** Catches up with transfers the shell finished while this page was away. Where the page moves files there are none. */
export const syncShellTransfers = (): Promise<void> =>
    appMovesFiles() ? syncFileTransfers(webClient, getNativeTransfers()) : Promise.resolve();
