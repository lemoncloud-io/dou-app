export type FileTransferDirection = 'upload' | 'download';

export type FileTransferState = 'running' | 'responded' | 'failed' | 'cancelled';

export type FileTransferErrorCode = 'NETWORK' | 'SOURCE' | 'INVALID' | 'SYSTEM' | 'INTERNAL';

type StartFileTransferCommon = {
    transferId: string;
    url: string;
    headers?: Record<string, string>;
    title?: string;
};

export type StartUploadPayload = StartFileTransferCommon & {
    direction: 'upload';
    method: 'PUT';
    file: {
        uri: string;
        contentType?: string;
        contentLength?: number;
    };
};

export type StartDownloadPayload = StartFileTransferCommon & {
    direction: 'download';
    method: 'GET';
    file?: {
        name?: string;
    };
};

export type StartFileTransferPayload = StartUploadPayload | StartDownloadPayload;

export type OnStartFileTransferPayload = {
    transferId: string;
};

export type CancelFileTransferPayload = {
    transferId: string;
};

export type OnCancelFileTransferPayload = {
    transferId: string;
};

export type ListFileTransfersPayload = {};

export type OnListFileTransfersPayload = {
    transfers: OnFileTransferStatePayload[];
};

export type AckFileTransfersPayload = {
    transferIds: string[];
};

export type OnAckFileTransfersPayload = {
    remaining: number;
};

export type WriteTempFilePayload = {
    base64: string;
    fileName?: string;
};

export type OnWriteTempFilePayload = {
    uri: string;
};

export type OnFileTransferStatePayload = {
    transferId: string;
    direction: FileTransferDirection;
    state: FileTransferState;
    transferredBytes: number;
    totalBytes: number;
    httpStatus?: number;
    providerCode?: string;
    errorCode?: FileTransferErrorCode;
    errorMessage?: string;
    file?: DownloadedFile;
};

export type DownloadedFile = {
    uri: string;
    size: number;
    contentType?: string;
};
