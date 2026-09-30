import { app, powerMonitor } from 'electron';
import electronUpdater from 'electron-updater';

import type { AppBridgeHost } from '@chatic/bridges';
import type { OnUpdateStatusPayload } from '@chatic/app-messages';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

import { CHECK_INTERVAL_MS, createUpdateCheckGate, isBusy, MIN_CHECK_GAP_MS } from './updateCadence';

const { autoUpdater } = electronUpdater;

let listenersAttached = false;
let activeHost: AppBridgeHost | null = null;
/** The last status pushed to the renderer. While it is busy (see isBusy) checks hold, and only then are errors reported. */
let lastStatus: OnUpdateStatusPayload['status'] | undefined;

/**
 * Desktop auto-update (electron-updater). The generic feed URL is baked into
 * app-update.yml at build time (electron-builder publish config). Ask-first UX:
 * the shell reports availability / progress / readiness to the renderer via
 * OnUpdateStatus, and the user agrees to download (StartUpdateDownload) then
 * restart (RestartToUpdate). No-op when unpackaged (dev `electron-vite dev` run
 * has no feed); mac apply additionally requires a signed build (prod only).
 * The feed is asked at launch, about every 30 minutes, on wake and on window focus, at most once
 * per 10 minutes (see updateCadence.ts), so a release reaches an app left open all day.
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
        // Busy from the click, not from the first progress event, so a check in between
        // cannot re-offer the update the user just accepted.
        lastStatus = 'downloading';
        // Progress and result arrive via the events below; a failure is also dispatched as 'error'.
        autoUpdater.downloadUpdate().catch(() => undefined);
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
        lastStatus = data.status;
        activeHost?.pushEvent({ type: 'OnUpdateStatus', success: true, data });
    };

    // A check already in flight when the user clicked Download must not re-offer mid-download.
    autoUpdater.on('update-available', (info: UpdateInfo) => {
        if (!isBusy(lastStatus)) push({ status: 'available', version: info.version });
    });
    autoUpdater.on('download-progress', (progress: ProgressInfo) =>
        push({ status: 'downloading', percent: Math.round(progress.percent) })
    );
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => push({ status: 'downloaded', version: info.version }));
    // An unhandled 'error' event would crash the main process — always listen. Report only a
    // failure the user started (a download, or the install after it). A background check that
    // fails — offline, a flaky network — stays silent and simply retries on the next trigger;
    // pushing it would swap the banner to a warning, and back, every time the network blinked.
    autoUpdater.on('error', (error: Error) => {
        if (isBusy(lastStatus)) push({ status: 'error', message: error?.message ?? 'update failed' });
    });

    // Every trigger shares one gate, so launch, the interval, wake and focus together ask the
    // feed at most once per MIN_CHECK_GAP_MS — and never while an update is downloading or ready.
    const gate = createUpdateCheckGate({ minGapMs: MIN_CHECK_GAP_MS });
    const check = (): void => {
        if (isBusy(lastStatus) || !gate.shouldCheck()) return;
        // A failed check is also dispatched as 'error'; the handler above leaves it silent, since a
        // check never runs while an update is busy.
        autoUpdater.checkForUpdates().catch(() => undefined);
    };
    check();
    setInterval(check, CHECK_INTERVAL_MS);
    // A machine asleep across the whole interval would otherwise wait for the
    // next tick — re-check on resume so it discovers updates promptly.
    powerMonitor.on('resume', check);
    // Coming back to the app is when a user would notice a new version, and it is not a
    // resume when the machine never slept.
    app.on('browser-window-focus', check);
};
