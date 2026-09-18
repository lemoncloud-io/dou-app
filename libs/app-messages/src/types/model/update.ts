/**
 * Desktop app auto-update (electron-updater) message payloads.
 * The shell (main) sends update status via OnUpdateStatus events, and the web (renderer)
 * requests StartUpdateDownload / RestartToUpdate after getting user consent.
 */

/** [Event] Update status (app -> web). Progress/version are filled in depending on status. */
export type OnUpdateStatusPayload = {
    status: 'available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    /** 0–100 when status is downloading. */
    percent?: number;
    /** Human-readable message when status is error. */
    message?: string;
};

/** [Request] Start update download (web -> app). Progress/result are delivered via OnUpdateStatus. */
export type StartUpdateDownloadPayload = {
    // Empty object type, reserved for future extension.
};

/** [Response] Result of accepting the start-update-download request. */
export type OnStartUpdateDownloadPayload = {
    success: boolean;
};

/** [Request] Restart to apply the update (web -> app). The app quits immediately via quitAndInstall. */
export type RestartToUpdatePayload = {
    // Empty object type, reserved for future extension.
};

/** [Response] Result of the restart request (usually not delivered since the app quits immediately). */
export type OnRestartToUpdatePayload = {
    success: boolean;
};
