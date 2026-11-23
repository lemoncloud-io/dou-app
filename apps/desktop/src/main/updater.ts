import { app, powerMonitor } from 'electron';
import electronUpdater from 'electron-updater';

import type { AppBridgeHost } from '@chatic/bridges';
import type { OnUpdateStatusPayload } from '@chatic/bridge-messages';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

import { CHECK_INTERVAL_MS, createUpdateCheckGate, isBusy, MIN_CHECK_GAP_MS } from './updateCadence';
import { createUpdaterLog } from './updaterLog';

const { autoUpdater } = electronUpdater;

let listenersAttached = false;
let activeHost: AppBridgeHost | null = null;
let lastStatus: OnUpdateStatusPayload['status'] | undefined;

export const startUpdater = (host: AppBridgeHost, beforeQuit: () => void): void => {
    if (!app.isPackaged) return;

    activeHost = host;
    host.registerHandler('StartUpdateDownload', () => {
        lastStatus = 'downloading';
        autoUpdater.downloadUpdate().catch(() => undefined);
        return { type: 'OnStartUpdateDownload', success: true, data: { success: true } };
    });
    host.registerHandler('RestartToUpdate', () => {
        setImmediate(() => {
            beforeQuit();
            autoUpdater.quitAndInstall();
        });
        return { type: 'OnRestartToUpdate', success: true, data: { success: true } };
    });

    if (listenersAttached) return;
    listenersAttached = true;

    autoUpdater.autoDownload = false;
    const log = createUpdaterLog(app.getPath('logs'));
    autoUpdater.logger = log;
    log.info(`Updater started: version ${app.getVersion()}, running ${process.execPath}`);

    const push = (data: OnUpdateStatusPayload): void => {
        lastStatus = data.status;
        activeHost?.pushEvent({ type: 'OnUpdateStatus', success: true, data });
    };

    autoUpdater.on('update-available', (info: UpdateInfo) => {
        if (!isBusy(lastStatus)) push({ status: 'available', version: info.version });
    });
    autoUpdater.on('download-progress', (progress: ProgressInfo) =>
        push({ status: 'downloading', percent: Math.round(progress.percent) })
    );
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => push({ status: 'downloaded', version: info.version }));
    autoUpdater.on('error', (error: Error) => {
        if (isBusy(lastStatus)) push({ status: 'error', message: error?.message ?? 'update failed' });
    });

    const gate = createUpdateCheckGate({ minGapMs: MIN_CHECK_GAP_MS });
    const check = (): void => {
        if (isBusy(lastStatus) || !gate.shouldCheck()) return;
        autoUpdater.checkForUpdates().catch(() => undefined);
    };
    check();
    setInterval(check, CHECK_INTERVAL_MS);
    powerMonitor.on('resume', check);
    app.on('browser-window-focus', check);
};
