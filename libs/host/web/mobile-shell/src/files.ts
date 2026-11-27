import type { AppFileTransfers, FilesPort, VideoFrameRequest } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const SHELL_USE_TIMEOUT_MS = 10 * 60_000;

export const READ_VIDEO_FRAME_TIMEOUT_MS = 25_000;

export interface ShellFileSender {
    readonly put: FilesPort['put'];
    readonly putShellFile: AppFileTransfers['putShellFile'];
}

export interface MobileShellFilesOptions {
    readonly bridge: ShellBridge;
    readonly sender: () => ShellFileSender;
    readonly syncUploads: () => Promise<void>;
}

export const mobileShellFiles =
    ({ bridge, sender, syncUploads }: MobileShellFilesOptions) =>
    (base: Pick<FilesPort, 'kind'>): FilesPort => ({
        ...base,
        put: (target, file, label, onProgress, signal) => sender().put(target, file, label, onProgress, signal),
        transfers: {
            putShellFile: (target, file, label, onProgress) => sender().putShellFile(target, file, label, onProgress),
            syncUploads: () => syncUploads(),
            openFile: async uri => {
                await bridge.request({ type: 'OpenFile', data: { uri } }, { timeoutMs: SHELL_USE_TIMEOUT_MS });
            },
            saveFile: async (uri, name) =>
                (await bridge.request({ type: 'SaveFile', data: { uri, name } }, { timeoutMs: SHELL_USE_TIMEOUT_MS }))
                    ?.data,
            readVideoFrame: async (request: VideoFrameRequest) =>
                (
                    await bridge.request(
                        { type: 'ReadVideoFrame', data: request },
                        { timeoutMs: READ_VIDEO_FRAME_TIMEOUT_MS }
                    )
                ).data,
        },
    });
