import { app } from 'electron';
import electronUpdater from 'electron-updater';

import type { AppBridgeHost } from '@chatic/bridges';
import type { OnUpdateStatusPayload } from '@chatic/app-messages';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

const { autoUpdater } = electronUpdater;

/** Re-check the feed periodically so a long-running session still discovers updates. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

let listenersAttached = false;
let activeHost: AppBridgeHost | null = null;

/**
 * Desktop auto-update (electron-updater). The generic feed URL is baked into
 * app-update.yml at build time (electron-builder publish config). Ask-first UX:
 * the shell reports availability / progress / readiness to the renderer via
 * OnUpdateStatus, and the user agrees to download (StartUpdateDownload) then
 * restart (RestartToUpdate). No-op when unpackaged (dev `electron-vite dev` run
 * has no feed); mac apply additionally requires a signed build (prod only).
 *
 * @param host       bridge host for the current window — recreated on macOS re-activate,
 *                   so events + handlers always target the latest one.
 * @param beforeQuit flips the shell's close-to-tray guard so quitAndInstall actually quits
 *                   (the window 'close' handler would otherwise hide instead of closing).
 */
export const startUpdater = (host: AppBridgeHost, beforeQuit: () => void): void => {
    if (!app.isPackaged) return;

    // The window (and its host) can be recreated on macOS re-activate — repoint both the
    // pushed events and the bridge handlers at the current host every call.
    activeHost = host;
    host.registerHandler('StartUpdateDownload', () => {
        void autoUpdater.downloadUpdate(); // progress + result arrive via the events below
        return { type: 'OnStartUpdateDownload', success: true, data: { success: true } };
    });
    host.registerHandler('RestartToUpdate', () => {
        // Defer so this response can flush; flip the quit guard first so close-to-tray lets
        // the window actually close, then install.
        setImmediate(() => {
            beforeQuit();
            autoUpdater.quitAndInstall();
        });
        return { type: 'OnRestartToUpdate', success: true, data: { success: true } };
    });

    // autoUpdater is a process-global singleton — attach its listeners (and start the
    // check loop) exactly once, regardless of how many windows come and go.
    if (listenersAttached) return;
    listenersAttached = true;

    autoUpdater.autoDownload = false; // ask before downloading

    const push = (data: OnUpdateStatusPayload): void => {
        activeHost?.pushEvent({ type: 'OnUpdateStatus', success: true, data });
    };

    autoUpdater.on('update-available', (info: UpdateInfo) => push({ status: 'available', version: info.version }));
    autoUpdater.on('download-progress', (progress: ProgressInfo) =>
        push({ status: 'downloading', percent: Math.round(progress.percent) })
    );
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => push({ status: 'downloaded', version: info.version }));
    // An unhandled 'error' event would crash the main process — swallow + report.
    autoUpdater.on('error', (error: Error) => push({ status: 'error', message: error?.message ?? 'update failed' }));

    const check = (): void => {
        // Feed/network failures also surface via the 'error' event handler above.
        autoUpdater.checkForUpdates().catch(() => undefined);
    };
    check();
    setInterval(check, CHECK_INTERVAL_MS);
};
