import type { OnReadVideoFramePayload, OnSaveFilePayload, ReadVideoFramePayload } from '@chatic/bridge-messages';
import type { PutPort, ShellFilePutPort } from '@chatic/data';

import type { ShellOrBrowser } from './ports';

export interface FilesPort {
    readonly kind: FilesMethod;
    readonly put: PutPort;
    readonly transfers: AppFileTransfers | null;
}

export type FilesMethod = ShellOrBrowser;

export interface AppFileTransfers {
    readonly putShellFile: ShellFilePutPort;
    syncUploads(): Promise<void>;
    openFile(uri: string): Promise<void>;
    saveFile(uri: string, name: string): Promise<OnSaveFilePayload | undefined>;
    readVideoFrame(request: ReadVideoFramePayload): Promise<OnReadVideoFramePayload>;
}
