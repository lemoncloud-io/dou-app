import type { PutPort, ShellFilePutPort } from '@chatic/data';

import type { ShellOrBrowser } from './ports';

export type SavedFile =
    | {
          saved: true;
          location: string;
      }
    | { saved: false };

export type VideoFrameRequest = {
    url: string;
    atMs: number;
    maxEdge: number;
};

export type VideoFrame = {
    base64: string;
    contentType: 'image/jpeg';
    width: number;
    height: number;
};

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
    saveFile(uri: string, name: string): Promise<SavedFile | undefined>;
    readVideoFrame(request: VideoFrameRequest): Promise<VideoFrame>;
}
