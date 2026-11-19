import { logger, webClient } from '@chatic/bridges';
import { filesAdapters } from '@chatic/runtime-web';
import type { FilesPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

// Direct paths, not the `bridge` barrel: the barrel re-exports its navigation, which pulls in the
// web transport and its `import.meta.env` — a syntax error under ts-jest's CommonJS output.
import { appBridge } from '../../app/bridge/appBridge';
import { createNativeTransfers, syncFileTransfers, type NativeTransfers } from '../../app/runtime/upload';
import { pageUploadPut } from '../upload';

/**
 * How long an open or a save may wait for the app: on iOS each answers only when its sheet or preview
 * closes, however long the person keeps it up. A shorter clock would drop that answer.
 */
export const SHELL_USE_TIMEOUT_MS = 10 * 60_000;

// One per page, on purpose: every waiting upload has to be reachable from the one event listener. Made
// on first use (an upload or `syncUploads`) rather than with the port, which is built again on every start.
let nativeTransfers: NativeTransfers | null = null;

const getNativeTransfers = (): NativeTransfers => {
    nativeTransfers ??= createNativeTransfers({
        bridge: webClient,
        fallback: pageUploadPut,
        log: (message, data) => logger.info('UPLOAD', message, data),
    });
    return nativeTransfers;
};

/** Test seam — forgets the page's transfer module; the next upload makes a new one. */
export const resetNativeTransfersForTest = (): void => {
    nativeTransfers?.dispose();
    nativeTransfers = null;
};

/**
 * Who moves a message's files in the web app: the shell or the page. Its shell is the phone app, whose
 * transfer module puts and fetches the bytes in the background, reached through `webClient` and
 * `appBridge`; the page sends with its own PUT and has no transfer module.
 */
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

/** `files.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: filesHost, shell: filesShell, browser: filesBrowser } = filesAdapters(webFiles);
