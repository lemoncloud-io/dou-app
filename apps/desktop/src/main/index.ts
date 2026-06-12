import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AppBridgeHost } from '@chatic/bridges';
import {
    app,
    BrowserWindow,
    ipcMain,
    Menu,
    type MenuItemConstructorOptions,
    nativeImage,
    Notification,
    screen,
    shell,
    Tray,
} from 'electron';
import electronUpdater from 'electron-updater';

import { startFcm, type FcmConfig } from './fcm';

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

const BOUNDS_MIN_WIDTH = 720;
const BOUNDS_MIN_HEIGHT = 480;

const windowBoundsFile = (): string => join(app.getPath('userData'), 'chatic-window-bounds.json');

const notifRegisteredFile = (): string => join(app.getPath('userData'), 'chatic-notifications-registered');

/**
 * macOS: a freshly-installed, never-notified bundle has no Notification Center
 * entry, so every Notification.show() silently no-ops AND the app never appears
 * in System Settings > Notifications for the user to allow it (there is no
 * requestPermission API for main-process Notifications). Post one silent
 * notification at first launch to register the bundle. Once per install (flag in
 * userData) so it isn't shown on every start.
 */
const registerMacNotifications = (): void => {
    if (process.platform !== 'darwin' || !Notification.isSupported()) return;
    if (existsSync(notifRegisteredFile())) return;
    try {
        new Notification({ title: 'DoU', body: 'Notifications are enabled.', silent: true }).show();
        writeFileSync(notifRegisteredFile(), '1');
    } catch {
        // best-effort registration — ignore failures
    }
};

/** Restore the last window size/position so the app reopens where the user left it. */
const loadWindowBounds = (): { x?: number; y?: number; width: number; height: number } | null => {
    try {
        const b = JSON.parse(readFileSync(windowBoundsFile(), 'utf8')) as {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
        };
        if (typeof b.width === 'number' && typeof b.height === 'number') {
            // Only restore the saved position if it still lands on a connected
            // display (a monitor may have been unplugged) — else let it center.
            const onScreen =
                typeof b.x === 'number' &&
                typeof b.y === 'number' &&
                screen.getAllDisplays().some(({ workArea }) => {
                    return (
                        b.x! >= workArea.x &&
                        b.y! >= workArea.y &&
                        b.x! < workArea.x + workArea.width &&
                        b.y! < workArea.y + workArea.height
                    );
                });
            return {
                x: onScreen ? b.x : undefined,
                y: onScreen ? b.y : undefined,
                width: Math.max(BOUNDS_MIN_WIDTH, b.width),
                height: Math.max(BOUNDS_MIN_HEIGHT, b.height),
            };
        }
    } catch {
        // First run or unreadable — fall back to defaults.
    }
    return null;
};

const saveWindowBounds = (win: BrowserWindow): void => {
    try {
        if (win.isMinimized() || win.isMaximized()) return;
        writeFileSync(windowBoundsFile(), JSON.stringify(win.getBounds()), 'utf8');
    } catch {
        // Best-effort; losing saved bounds just reopens at defaults.
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

// Last OS notification shown per channel (keyed by deeplink). Electron's
// Notification has no web-style `tag`, so we coalesce by closing the prior toast
// for the same channel before showing a new one — rapid messages replace instead
// of stacking.
const activeNotifications = new Map<string, Notification>();

/**
 * Raise an OS notification (coalesced per channel/deeplink) and draw attention
 * when unfocused. Shared by the web→app `ShowNotification` bridge (live-WS,
 * same-cloud) and the FCM receiver (cross-cloud push). Click reshows the window
 * and routes the deeplink into the web.
 */
const showOsNotification = (
    host: AppBridgeHost,
    win: BrowserWindow,
    params: { title: string; body: string; deeplink?: string }
): void => {
    const { title, body, deeplink } = params;
    if (Notification.isSupported()) {
        const key = deeplink || title;
        activeNotifications.get(key)?.close();
        const notification = new Notification({ title, body });
        activeNotifications.set(key, notification);
        notification.on('close', () => {
            if (activeNotifications.get(key) === notification) activeNotifications.delete(key);
        });
        notification.on('click', () => {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
            if (deeplink) pushDeeplink(host, deeplink);
        });
        notification.show();
    }
    if (!win.isFocused()) {
        if (process.platform === 'darwin') app.dock?.bounce('informational');
        else win.flashFrame(true);
    }
};

// Cross-cloud push (FCM): the token the renderer registers with the broker, plus
// resolvers so a FetchFcmToken bridge request can await an in-flight registration.
let fcmToken: string | null = null;
let fcmTokenWaiters: Array<(token: string) => void> = [];
const onFcmToken = (token: string): void => {
    fcmToken = token;
    fcmTokenWaiters.forEach(resolve => resolve(token));
    fcmTokenWaiters = [];
};
const awaitFcmToken = (): Promise<string> => {
    if (fcmToken) return Promise.resolve(fcmToken);
    return new Promise(resolve => {
        fcmTokenWaiters.push(resolve);
        setTimeout(() => resolve(fcmToken ?? ''), 30_000);
    });
};

/** FCM project credentials baked per-stage (.env, mirrors apps/mobile google-services.json). */
const readFcmConfig = (): FcmConfig => ({
    apiKey: import.meta.env.MAIN_VITE_FCM_API_KEY ?? '',
    projectId: import.meta.env.MAIN_VITE_FCM_PROJECT_ID ?? '',
    senderId: import.meta.env.MAIN_VITE_FCM_SENDER_ID ?? '',
    appId: import.meta.env.MAIN_VITE_FCM_APP_ID ?? '',
    packageName: import.meta.env.MAIN_VITE_FCM_PACKAGE ?? '',
});

/** Register native-capability handlers on the bridge host (web → app requests). */
const registerHandlers = (host: AppBridgeHost, win: BrowserWindow): void => {
    // ShowNotification: the live web WS detected a message in the CURRENT cloud →
    // show an OS notification. (Cross-cloud pushes arrive via FCM, see startFcm.)
    host.registerHandler('ShowNotification', message => {
        const { title, body, deeplink } = message.data;
        showOsNotification(host, win, { title, body, deeplink });
        return { type: 'OnShowNotification', success: true, data: { success: true } };
    });

    // FetchFcmToken: the renderer asks for the FCM token to register with the
    // broker (reg-dev, platform 'desktop'). Awaits the in-flight Android
    // registration; resolves '' if FCM is unconfigured/slow so the web degrades.
    host.registerHandler('FetchFcmToken', async () => {
        const token = await awaitFcmToken();
        return { type: 'OnFetchFcmToken', success: true, data: { token } };
    });

    // SetBadgeCount: unread badge. macOS/Linux use the dock badge; Windows has none,
    // so paint a taskbar overlay icon from the PNG the renderer rendered (Electron's
    // nativeImage can't rasterize SVG). Cleared with null at zero.
    host.registerHandler('SetBadgeCount', message => {
        const { count } = message.data;
        // Optional Windows overlay PNG. Read structurally: the field crosses the
        // @chatic/app-messages → bridges project-reference boundary, where the
        // emitted declaration can lag the source type.
        const { overlayIconDataUrl } = message.data as { overlayIconDataUrl?: string };
        if (process.platform === 'win32') {
            let icon: Electron.NativeImage | null = null;
            if (count > 0 && overlayIconDataUrl) {
                const img = nativeImage.createFromDataURL(overlayIconDataUrl);
                if (!img.isEmpty()) icon = img;
            }
            win.setOverlayIcon(icon, count > 0 ? `${count} unread` : '');
            return { type: 'OnSetBadgeCount', success: true, data: { success: true } };
        }
        const ok = app.setBadgeCount(count);
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
    tray.setToolTip('DoU');
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: 'Open DoU', click: () => (win.isVisible() ? win.focus() : win.show()) },
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

// Minimal dark splash (matches the app's rail chrome + lime accent) shown until
// the remote web app loads. Inlined so it needs no bundled asset.
const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0b0d10}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
  .ring{width:38px;height:38px;border:3px solid #23272e;border-top-color:#8fbf2e;border-radius:50%;animation:spin .8s linear infinite}
  .label{color:#5b616b;font-size:13px;letter-spacing:.04em}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.ring{animation:none}}
</style></head><body><div class="wrap"><div class="ring"></div><div class="label">Loading DoU…</div></div></body></html>`;

// Branded error page shown when the remote web fails to load, so a failure is a visible,
// actionable screen instead of a blank window or a raw Chromium error. The retry link points
// at the trusted web URL — will-navigate allows that origin, so a click simply reloads it.
const renderErrorHtml = (code: number, desc: string): string => {
    // Strip HTML-significant chars before interpolating into the data: URL. desc is a Chromium
    // error enum (low risk), but escaping it keeps the page injection-safe as a matter of course.
    const sanitize = (value: string): string => String(value).replace(/[<>"]/g, '');
    const target = sanitize(DESKTOP_WEB_URL);
    const safeDesc = sanitize(desc);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;height:100%;background:#0b0d10;color:#e6e8eb;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;box-sizing:border-box;text-align:center}
  h1{font-size:17px;margin:0;font-weight:600}
  p{font-size:13px;line-height:1.6;color:#7a8089;margin:0;max-width:380px;word-break:break-all}
  code{color:#9aa0a6}
  a{margin-top:8px;display:inline-block;padding:10px 22px;border-radius:8px;background:#8fbf2e;color:#0b0d10;font-weight:600;font-size:14px;text-decoration:none}
</style></head><body><div class="wrap">
  <h1>연결할 수 없습니다</h1>
  <p>데스크톱 웹을 불러오지 못했습니다.<br><code>${target}</code><br>(${code} ${safeDesc})</p>
  <a href="${target}">다시 시도</a>
</div></body></html>`;
};

/** Native application menu with standard roles so copy/paste/zoom/window shortcuts work. */
const buildAppMenu = (): Menu => {
    const isMac = process.platform === 'darwin';
    const viewSubmenu: MenuItemConstructorOptions[] = [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // DevTools only in dev builds — keep it out of the packaged app's menu.
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' } as MenuItemConstructorOptions]),
    ];
    const template: MenuItemConstructorOptions[] = [
        ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
        // Cmd/Ctrl+W: `close` fires the window 'close' handler, so close-to-tray hides instead of destroying.
        { label: 'File', submenu: [{ role: 'close' }] },
        { role: 'editMenu' },
        { label: 'View', submenu: viewSubmenu },
        { role: 'windowMenu' },
    ];
    return Menu.buildFromTemplate(template);
};

const createWindow = (): BrowserWindow => {
    const saved = loadWindowBounds();
    const win = new BrowserWindow({
        width: saved?.width ?? 1280,
        height: saved?.height ?? 832,
        ...(saved?.x != null && saved?.y != null ? { x: saved.x, y: saved.y } : {}),
        minWidth: BOUNDS_MIN_WIDTH,
        minHeight: BOUNDS_MIN_HEIGHT,
        show: false,
        // Match the app's dark rail chrome so first paint / show has no white flash.
        backgroundColor: '#0b0d10',
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

    // Lock the renderer to the trusted origin: never open a new Electron window
    // (which would keep the preload bridge). External web links (message content,
    // etc.) open in the system browser instead; everything else is denied.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url) && !isTrustedUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });
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

    // Cross-cloud push: register for an FCM token (renderer registers it with the
    // broker via FetchFcmToken→reg-dev) and surface incoming pushes as OS
    // notifications. Best-effort — failure degrades to the live-WS same-cloud path.
    void startFcm(readFcmConfig(), {
        onToken: onFcmToken,
        onPush: push => {
            showOsNotification(host, win, {
                title: push.title ?? 'DoU',
                body: push.body ?? '',
                deeplink: push.deeplink,
            });
            // Also forward to the renderer for an in-app toast: macOS suppresses OS
            // banners from the focused app, so a cross-cloud push that lands while DoU
            // is active would otherwise be invisible.
            host.pushEvent({
                type: 'OnReceiveNotification',
                success: true,
                data: { notification: { title: push.title, body: push.body, data: push.data } },
            });
        },
    }).catch(error => console.error('[fcm] start failed', error));

    // Only accept bridge requests from the trusted origin's frame.
    ipcMain.on(TO_APP_CHANNEL, (event, data: string) => {
        if (!isTrustedUrl(event.senderFrame?.url)) return;
        host.handleMessage(data);
    });

    // Persist size/position so the next launch reopens where the user left it.
    win.on('resized', () => saveWindowBounds(win));
    win.on('moved', () => saveWindowBounds(win));

    // Stop the taskbar flash once the user looks at the window.
    win.on('focus', () => win.flashFrame(false));

    // Close-to-tray: hide instead of destroy unless actually quitting.
    win.on('close', event => {
        saveWindowBounds(win);
        if (!isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });

    createTray(win);

    win.once('ready-to-show', () => win.show());

    // In dev the local web server (desktop-web on :5005) may still be booting, so `desktop:start`
    // can launch the shell and the server in any order. Retry connection failures silently there;
    // for a packaged build (or any other failure) show a visible, retryable error page instead of
    // a blank window — e.g. an unresolved host when the desktop web isn't deployed yet.
    const RETRYABLE_LOAD_ERRORS = new Set([-102, -106, -105, -118]);
    win.webContents.on('did-fail-load', (_event, errorCode, errorDesc, validatedURL, isMainFrame) => {
        if (errorCode === -3) return; // ERR_ABORTED — e.g. the splash being replaced by the app load.
        if (!isMainFrame || !isTrustedUrl(validatedURL)) return;
        if (!app.isPackaged && RETRYABLE_LOAD_ERRORS.has(errorCode)) {
            setTimeout(() => win.loadURL(DESKTOP_WEB_URL), 700);
            return;
        }
        if (!win.isVisible()) win.show();
        void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorHtml(errorCode, errorDesc))}`);
    });

    // Paint an instant splash so the window shows a branded loader immediately
    // instead of staying hidden while the remote web bundle downloads/parses.
    // The real app replaces it once the splash has rendered.
    let appLoadStarted = false;
    const loadApp = (): void => {
        if (appLoadStarted) return;
        appLoadStarted = true;
        void win.loadURL(DESKTOP_WEB_URL);
    };
    win.webContents.once('did-finish-load', loadApp);
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`);

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
        Menu.setApplicationMenu(buildAppMenu());
        createWindow();

        // macOS: register the bundle with Notification Center on first launch so
        // OS toasts actually surface and the app is toggleable in System Settings.
        registerMacNotifications();

        // Flush a cold-start deeplink (Windows/Linux argv) once the window exists.
        const coldUrl = pendingDeeplink ?? extractDeeplink(process.argv);
        pendingDeeplink = null;
        if (coldUrl) handleDeeplink(coldUrl);

        // Auto-update the shell only (web updates remotely per ADR-0001). Production only.
        if (app.isPackaged) electronUpdater.autoUpdater.checkForUpdatesAndNotify();

        app.on('activate', () => {
            const [existing] = BrowserWindow.getAllWindows();
            if (!existing) {
                createWindow();
                return;
            }
            // Close-to-tray hides (does not destroy) the window, so it still counts
            // in getAllWindows — a macOS dock-icon click must explicitly reshow it.
            if (!existing.isVisible()) existing.show();
            existing.focus();
        });
    });

    // Close-to-tray means we do NOT quit on window-all-closed (tray keeps app alive).
}
