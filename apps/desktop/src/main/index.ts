import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AppBridgeHost } from '@chatic/bridges';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } from 'electron';
import electronUpdater from 'electron-updater';

/**
 * Stable per-install device id, persisted under userData. Injected into the web as
 * window.CHATIC_APP_DEVICE_ID so the guest account is consistent across restarts
 * (empty id would make web-core fall back to ephemeral sessionStorage ids → a new
 * guest every launch, breaking session + invite/channel continuity).
 */
const getOrCreateDeviceId = (): string => {
    const file = join(app.getPath('userData'), 'chatic-device-id');
    try {
        if (existsSync(file)) {
            const existing = readFileSync(file, 'utf8').trim();
            if (existing) return existing;
        }
        const id = randomUUID();
        writeFileSync(file, id, 'utf8');
        return id;
    } catch {
        // Fall back to a process-lifetime id if disk access fails.
        return randomUUID();
    }
};

/** IPC channel for App(main) → Web(renderer) bridge messages. */
const TO_WEB_CHANNEL = 'chatic-bridge:to-web';
/** IPC channel for Web(renderer) → App(main) bridge messages. */
const TO_APP_CHANNEL = 'chatic-bridge:to-app';

/**
 * Remote Desktop Web URL, baked at build time (ADR 0001/0003). electron-vite statically
 * replaces import.meta.env.MAIN_VITE_* into the main bundle, so packaged builds carry the
 * right URL (a packaged app has no process.env). Local `electron-vite dev` leaves it unset →
 * falls back to the concurrent local desktop-web vite server on :5005.
 */
const DESKTOP_WEB_URL = import.meta.env.MAIN_VITE_DESKTOP_WEB_URL ?? 'http://localhost:5005';

/** Trusted origin for the remote web content. IPC + navigation are locked to it. */
const trustedOrigin = (() => {
    try {
        return new URL(DESKTOP_WEB_URL).origin;
    } catch {
        return '';
    }
})();

const isTrustedUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    try {
        return new URL(url).origin === trustedOrigin;
    } catch {
        return false;
    }
};

/** Set on app quit so the window 'close' handler stops intercepting (close-to-tray otherwise keeps it alive). */
let isQuitting = false;
let tray: Tray | null = null;

/** Forward a deeplink URL to the web via the existing OnReceiveNotification event (web routes it). */
const pushDeeplink = (host: AppBridgeHost, url: string): void => {
    host.pushEvent({
        type: 'OnReceiveNotification',
        success: true,
        data: { notification: { data: { deeplink: url } } },
    });
};

/** Register native-capability handlers on the bridge host (web → app requests). */
const registerHandlers = (host: AppBridgeHost, win: BrowserWindow): void => {
    // ShowNotification: live web WS detected a message → show an OS notification (desktop has no FCM).
    host.registerHandler('ShowNotification', message => {
        const { title, body, deeplink } = message.data;
        if (Notification.isSupported()) {
            const notification = new Notification({ title, body });
            notification.on('click', () => {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
                if (deeplink) pushDeeplink(host, deeplink);
            });
            notification.show();
        }
        return { type: 'OnShowNotification', success: true, data: { success: true } };
    });

    // SetBadgeCount: unread badge. macOS/Linux dock; Windows setBadgeCount is a no-op (overlay needed) — guarded.
    host.registerHandler('SetBadgeCount', message => {
        const ok = process.platform === 'win32' ? false : app.setBadgeCount(message.data.count);
        return { type: 'OnSetBadgeCount', success: true, data: { success: ok } };
    });
};

/** System tray with close-to-tray so the renderer (and its WS) stays alive for background notifications. */
const createTray = (win: BrowserWindow): void => {
    // tray.png ships via electron-builder extraResources in packaged builds; in dev it sits
    // beside the project root (out/main → ../../build). createFromPath tolerates a missing file
    // (returns an empty image), so a bad path degrades to the old empty-tray behaviour.
    const trayIconPath = app.isPackaged
        ? join(process.resourcesPath, 'tray.png')
        : join(__dirname, '../../build/tray.png');
    tray = new Tray(nativeImage.createFromPath(trayIconPath));
    tray.setToolTip('Chatic');
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: 'Open Chatic', click: () => (win.isVisible() ? win.focus() : win.show()) },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true;
                    app.quit();
                },
            },
        ])
    );
    tray.on('click', () => (win.isVisible() ? win.focus() : win.show()));
};

const createWindow = (): BrowserWindow => {
    const win = new BrowserWindow({
        width: 1280,
        height: 832,
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            additionalArguments: [`--chatic-device-id=${getOrCreateDeviceId()}`],
            contextIsolation: true,
            nodeIntegration: false,
            // contextIsolation + nodeIntegration:false is the isolation boundary. sandbox stays
            // off for now because the preload reads process.env (device id/stage/lang) and uses
            // Buffer; enabling sandbox needs those moved to main + passed via additionalArguments.
            // TODO: enable sandbox once preload env access is restructured.
            backgroundThrottling: false,
        },
    });

    // Lock the renderer to the trusted origin: deny new windows, block off-origin navigation.
    // Prevents a redirected/untrusted page from retaining the preload bridge to native handlers.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
        if (!isTrustedUrl(url)) event.preventDefault();
    });
    // Also block off-origin server redirects (will-navigate doesn't cover 30x).
    win.webContents.on('will-redirect', (event, url) => {
        if (!isTrustedUrl(url)) event.preventDefault();
    });

    const host = new AppBridgeHost({
        sendToWeb: (message: string) => win.webContents.send(TO_WEB_CHANNEL, message),
    });
    registerHandlers(host, win);

    // Only accept bridge requests from the trusted origin's frame.
    ipcMain.on(TO_APP_CHANNEL, (event, data: string) => {
        if (!isTrustedUrl(event.senderFrame?.url)) return;
        host.handleMessage(data);
    });

    // Close-to-tray: hide instead of destroy unless actually quitting.
    win.on('close', event => {
        if (!isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });

    createTray(win);

    win.once('ready-to-show', () => win.show());

    // Retry the initial load while the dev web server (desktop-web on :5005) is still
    // coming up, so `desktop:start` can launch the shell and the server concurrently
    // without caring about order. Only retries connection failures (errorCode -102/-106).
    const RETRYABLE_LOAD_ERRORS = new Set([-102, -106, -105, -118]);
    win.webContents.on('did-fail-load', (_event, errorCode, _desc, validatedURL) => {
        if (app.isPackaged) return;
        if (!isTrustedUrl(validatedURL) || !RETRYABLE_LOAD_ERRORS.has(errorCode)) return;
        setTimeout(() => win.loadURL(DESKTOP_WEB_URL), 700);
    });
    win.loadURL(DESKTOP_WEB_URL);

    // Stash host for deeplink delivery from app-level events.
    deeplinkHost = host;
    deeplinkWindow = win;

    return win;
};

// Deeplink plumbing — app-level url/argv events resolve before/after the window exists.
let deeplinkHost: AppBridgeHost | null = null;
let deeplinkWindow: BrowserWindow | null = null;
let pendingDeeplink: string | null = null;

const handleDeeplink = (url: string): void => {
    if (deeplinkHost && deeplinkWindow) {
        if (deeplinkWindow.isMinimized()) deeplinkWindow.restore();
        deeplinkWindow.show();
        deeplinkWindow.focus();
        pushDeeplink(deeplinkHost, url);
    } else {
        pendingDeeplink = url;
    }
};

// Match both chatic:// and slashless chatic: forms (some platforms route the latter).
const extractDeeplink = (argv: string[]): string | undefined => argv.find(arg => arg.startsWith('chatic:'));

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
    app.quit();
} else {
    // Dev (unpackaged) must register execPath + script path; packaged registers the app directly.
    if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('chatic', process.execPath, [resolve(process.argv[1])]);
    } else {
        app.setAsDefaultProtocolClient('chatic');
    }

    // Windows/Linux: deeplink arrives as argv on second launch.
    app.on('second-instance', (_event, argv) => {
        const url = extractDeeplink(argv);
        if (url) handleDeeplink(url);
        else if (deeplinkWindow) deeplinkWindow.show();
    });

    // macOS: deeplink arrives via open-url.
    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeeplink(url);
    });

    app.on('before-quit', () => {
        isQuitting = true;
    });

    app.whenReady().then(() => {
        createWindow();

        // Flush a cold-start deeplink (Windows/Linux argv) once the window exists.
        const coldUrl = pendingDeeplink ?? extractDeeplink(process.argv);
        pendingDeeplink = null;
        if (coldUrl) handleDeeplink(coldUrl);

        // Auto-update the shell only (web updates remotely per ADR-0001). Production only.
        if (app.isPackaged) electronUpdater.autoUpdater.checkForUpdatesAndNotify();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    // Close-to-tray means we do NOT quit on window-all-closed (tray keeps app alive).
}
