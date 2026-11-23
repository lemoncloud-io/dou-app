export type OnUpdateStatusPayload = {
    status: 'available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    percent?: number;
    message?: string;
};

export type StartUpdateDownloadPayload = {};

export type OnStartUpdateDownloadPayload = {
    success: boolean;
};

export type RestartToUpdatePayload = {};

export type OnRestartToUpdatePayload = {
    success: boolean;
};
