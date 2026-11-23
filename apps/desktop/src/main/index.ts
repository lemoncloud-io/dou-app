import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { AppBridgeHost } from '@chatic/bridges';
import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Menu,
    type MenuItemConstructorOptions,
    nativeImage,
    nativeTheme,
    Notification,
    powerMonitor,
    protocol,
    safeStorage,
    screen,
    session,
    shell,
    Tray,
} from 'electron';
import { resolveAppLanguage } from './appLanguage';
import { bringToFront } from './bringToFront';
import { DESKTOP_MAIN_HOST_OPTIONS, registerHandlers } from './bridgeHandlers';
import { menuLabels } from './menuLabels';
import {
    applyCustomUi,
    disableCustomUi,
    getActiveCustomUiRoot,
    restoreCustomUi,
    serveCustomUi,
} from './customUiBundle';
import { CUSTOM_UI_CHANNEL, customUiBoot, customUiRefusal, type CustomUiStatus } from './customUiContract';
import { CUSTOM_UI_SCHEME_PRIVILEGES } from './customUiProtocol';
import { hasEntryPoint } from './customUiState';
import { createDownloadLog, createDownloadTargets, savesWithoutAsking } from './downloads';
import { DOWNLOAD_DONE_CHANNEL, DOWNLOAD_REVEAL_CHANNEL, type DownloadDone } from './downloadsContract';
import { startFcm, type FcmConfig } from './fcm';
import { createLoginItem, LOGIN_ITEM_UNSUPPORTED } from './loginItem';
import { grantsPermission } from './permissions';
import { LOGIN_ITEM_CHANNEL, type LaunchAtLoginState } from './loginItemContract';
import { startUpdater } from './updater';
import { pushDeeplink, pushFcmMessage, pushFcmToken } from './shellEvents';
import { SECURE_STORAGE_FILE, SecureStorage } from './secureStorage';
import { fromTrustedFrame } from './ipcSenderGate';
import { initWebUrl, isCustomUiActive, isCustomUiUrl, isTrustedUrl, resolveWebUrl } from './webUrl';
import { DesktopSubWebViewService, forwardSubWebViewClosed } from './subWebView/DesktopSubWebViewService';
import { attachDesktopSubWebView } from './subWebView/desktopSubWebViewWindow';

const IS_DEV_CHANNEL = !app.isPackaged || import.meta.env.MAIN_VITE_CHANNEL === 'dev';
if (IS_DEV_CHANNEL) {
    app.setName('DoU Dev');
    app.setPath('userData', join(app.getPath('appData'), 'chatic-desktop-dev'));
}

const PROTOCOL_SCHEME = IS_DEV_CHANNEL ? 'chatic-dev' : 'chatic';

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
        return randomUUID();
    }
};

const BOUNDS_MIN_WIDTH = 720;
const BOUNDS_MIN_HEIGHT = 480;

const windowBoundsFile = (): string => join(app.getPath('userData'), 'chatic-window-bounds.json');

const notifRegisteredFile = (): string => join(app.getPath('userData'), 'chatic-notifications-registered');

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

const loadWindowBounds = (): { x?: number; y?: number; width: number; height: number } | null => {
    try {
        const b = JSON.parse(readFileSync(windowBoundsFile(), 'utf8')) as {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
        };
        if (typeof b.width === 'number' && typeof b.height === 'number') {
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

const TO_WEB_CHANNEL = 'chatic-bridge:to-web';
const TO_APP_CHANNEL = 'chatic-bridge:to-app';

const DESKTOP_WEB_URL = import.meta.env.MAIN_VITE_DESKTOP_WEB_URL ?? 'http://localhost:5005';

initWebUrl(DESKTOP_WEB_URL);

protocol.registerSchemesAsPrivileged([CUSTOM_UI_SCHEME_PRIVILEGES]);

let isQuitting = false;
let tray: Tray | null = null;
let trayWindow: BrowserWindow | null = null;

let mainHost: AppBridgeHost | null = null;

const subWebViewService = new DesktopSubWebViewService(error => console.error('[sub-webview] listener threw', error));

const secureStorage = new SecureStorage({
    safeStorage,
    fs: { readFile: path => readFile(path), writeFile, rename, rm },
    filePath: join(app.getPath('userData'), SECURE_STORAGE_FILE),
    platform: process.platform,
});

const openInWeb = (target: 'settings' | 'shortcuts' | 'switcher' | 'search'): void => {
    const win = trayWindow;
    if (win && !win.isDestroyed()) {
        bringToFront(win);
    }
    if (mainHost) pushDeeplink(mainHost, `chatic-ui:${target}`);
};

const showOsNotification = (
    host: AppBridgeHost,
    win: BrowserWindow,
    params: { title: string; body: string; deeplink?: string }
): void => {
    const { title, body, deeplink } = params;
    if (Notification.isSupported()) {
        const notification = new Notification({ title, body });
        notification.on('click', () => {
            bringToFront(win);
            if (deeplink) pushDeeplink(host, deeplink);
        });
        notification.show();
    }
    if (!win.isFocused()) {
        if (process.platform === 'darwin') app.dock?.bounce('informational');
        else win.flashFrame(true);
    }
};

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
        const timer = setTimeout(() => {
            fcmTokenWaiters = fcmTokenWaiters.filter(waiter => waiter !== entry);
            resolve(fcmToken ?? '');
        }, 30_000);
        const entry = (token: string): void => {
            clearTimeout(timer);
            resolve(token);
        };
        fcmTokenWaiters.push(entry);
    });
};

const readFcmConfig = (): FcmConfig => ({
    apiKey: import.meta.env.MAIN_VITE_FCM_API_KEY ?? '',
    projectId: import.meta.env.MAIN_VITE_FCM_PROJECT_ID ?? '',
    senderId: import.meta.env.MAIN_VITE_FCM_SENDER_ID ?? '',
    appId: import.meta.env.MAIN_VITE_FCM_APP_ID ?? '',
    packageName: import.meta.env.MAIN_VITE_FCM_PACKAGE ?? '',
});

const setBadgeCount = (win: BrowserWindow, count: number, overlayIconDataUrl?: string): boolean => {
    if (process.platform === 'win32') {
        let icon: Electron.NativeImage | null = null;
        if (count > 0 && overlayIconDataUrl) {
            const img = nativeImage.createFromDataURL(overlayIconDataUrl);
            if (!img.isEmpty()) icon = img;
        }
        win.setOverlayIcon(icon, count > 0 ? `${count} unread` : '');
        return true;
    }
    return app.setBadgeCount(count);
};

const SAMPLE_CUSTOM_UI_ZIP = 'https://lemon-ade-storage.s3.ap-northeast-2.amazonaws.com/custom-web-poc-desktopweb.zip';

const customUiStatus = (error?: string): CustomUiStatus => ({
    active: isCustomUiActive(),
    root: getActiveCustomUiRoot(),
    ...(error === undefined ? {} : { error }),
});

const asCustomUiRequest = (value: unknown): { action?: unknown; zipUrl?: unknown } =>
    typeof value === 'object' && value !== null ? value : {};

const handleCustomUiApply = async (senderUrl: string | undefined, zipUrl: unknown): Promise<CustomUiStatus> => {
    if (isCustomUiUrl(senderUrl)) return customUiStatus('a bundle cannot apply another bundle');
    if (typeof zipUrl !== 'string' || !zipUrl) return customUiStatus('no zip URL given');
    try {
        await applyCustomUi(zipUrl);
    } catch (error) {
        return customUiStatus(String(error));
    }
    return customUiStatus();
};

const registerCustomUiIpc = (win: BrowserWindow): void => {
    ipcMain.removeHandler(CUSTOM_UI_CHANNEL);
    ipcMain.handle(
        CUSTOM_UI_CHANNEL,
        fromTrustedFrame(
            async () => customUiStatus('untrusted frame'),
            async (senderUrl, raw: unknown) => {
                const { action, zipUrl } = asCustomUiRequest(raw);

                const refusal = customUiRefusal(action, IS_DEV_CHANNEL);
                if (refusal !== null) return customUiStatus(refusal);

                if (action === 'status') return customUiStatus();

                if (action === 'disable') {
                    disableCustomUi();
                    scheduleReload(win);
                    return customUiStatus();
                }

                if (action === 'apply') {
                    const status = await handleCustomUiApply(senderUrl, zipUrl);
                    if (!status.error) scheduleReload(win);
                    return status;
                }

                return customUiStatus(`unknown action: ${String(action)}`);
            }
        )
    );
};

const loginItem = createLoginItem(app, process.platform);

const downloadLog = createDownloadLog();

const registerDownloadIpc = (): void => {
    ipcMain.removeHandler(DOWNLOAD_REVEAL_CHANNEL);
    ipcMain.handle(
        DOWNLOAD_REVEAL_CHANNEL,
        fromTrustedFrame(
            () => false,
            (_senderUrl, id: unknown): boolean => {
                const path = downloadLog.pathOf(id);
                if (!path || !existsSync(path)) return false;
                shell.showItemInFolder(path);
                return true;
            }
        )
    );
};

const registerLoginItemIpc = (): void => {
    ipcMain.removeHandler(LOGIN_ITEM_CHANNEL);
    ipcMain.handle(
        LOGIN_ITEM_CHANNEL,
        fromTrustedFrame(
            (): LaunchAtLoginState => LOGIN_ITEM_UNSUPPORTED,
            (_senderUrl, raw: unknown): LaunchAtLoginState => {
                const request = (raw ?? {}) as { action?: unknown; enabled?: unknown };
                if (request.action === 'set') return loginItem.write(request.enabled === true);
                return loginItem.read();
            }
        )
    );
};

const scheduleReload = (win: BrowserWindow): void => {
    setTimeout(() => reloadForCustomUiChange(win), 0);
};

const reloadForCustomUiChange = (win: BrowserWindow): void => {
    if (!win.isDestroyed()) void win.loadURL(resolveWebUrl());
    refreshTrayMenu();
    Menu.setApplicationMenu(buildAppMenu());
};

const fallbackToRemoteWeb = (win: BrowserWindow, reason: string): void => {
    console.warn('[shell] custom UI failed, falling back to remote web', reason);
    disableCustomUi();
    reloadForCustomUiChange(win);
};

const bundleFailed = (url?: string): boolean => (url === undefined ? isCustomUiActive() : isCustomUiUrl(url));

const customUiTrayItems = (win: BrowserWindow): MenuItemConstructorOptions[] => {
    const items: MenuItemConstructorOptions[] = [];
    if (IS_DEV_CHANNEL) {
        items.push({
            label: 'Apply custom UI (sample)',
            click: () => {
                void applyCustomUi(SAMPLE_CUSTOM_UI_ZIP)
                    .then(() => reloadForCustomUiChange(win))
                    .catch((error: unknown) => {
                        dialog.showErrorBox('Custom UI failed', String(error));
                    });
            },
        });
    }
    if (isCustomUiActive()) {
        items.push({
            label: 'Reset custom UI',
            click: () => {
                disableCustomUi();
                reloadForCustomUiChange(win);
            },
        });
    }
    return items.length ? [{ type: 'separator' }, ...items] : [];
};

const buildTrayMenu = (win: BrowserWindow): Menu =>
    Menu.buildFromTemplate([
        { label: 'Open DoU', click: () => bringToFront(win) },
        ...customUiTrayItems(win),
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);

const refreshTrayMenu = (): void => {
    if (tray && trayWindow && !trayWindow.isDestroyed()) tray.setContextMenu(buildTrayMenu(trayWindow));
};

const createTray = (win: BrowserWindow): void => {
    const trayIconPath = app.isPackaged
        ? join(process.resourcesPath, 'tray.png')
        : join(__dirname, '../../build/tray.png');
    const trayIcon = nativeImage.createFromPath(trayIconPath);
    if (process.platform === 'darwin') trayIcon.setTemplateImage(true);
    tray?.destroy();
    tray = new Tray(trayIcon);
    trayWindow = win;
    tray.setToolTip('DoU');
    tray.setContextMenu(buildTrayMenu(win));
    tray.on('click', () => bringToFront(win));
};

const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0b0d10}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
  .ring{width:38px;height:38px;border:3px solid #23272e;border-top-color:#8fbf2e;border-radius:50%;animation:spin .8s linear infinite}
  .label{color:#5b616b;font-size:13px;letter-spacing:.04em}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.ring{animation:none}}
</style></head><body><div class="wrap"><div class="ring"></div><div class="label">Loading DoU…</div></div></body></html>`;

const ERROR_STRINGS = {
    ko: { title: '연결할 수 없습니다', body: '데스크톱 웹을 불러오지 못했습니다.', retry: '다시 시도' },
    en: { title: 'Unable to connect', body: 'The desktop web could not be loaded.', retry: 'Retry' },
} as const;

const renderErrorHtml = (code: number, desc: string): string => {
    const sanitize = (value: string): string => String(value).replace(/[<>"]/g, '');
    const target = sanitize(resolveWebUrl());
    const safeDesc = sanitize(desc);
    const lang = app.getLocale().startsWith('ko') ? 'ko' : 'en';
    const strings = ERROR_STRINGS[lang];
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;height:100%;background:#0b0d10;color:#e6e8eb;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;box-sizing:border-box;text-align:center}
  h1{font-size:17px;margin:0;font-weight:600}
  p{font-size:13px;line-height:1.6;color:#7a8089;margin:0;max-width:380px;word-break:break-all}
  code{color:#9aa0a6}
  a{margin-top:8px;display:inline-block;padding:10px 22px;border-radius:8px;background:#8fbf2e;color:#0b0d10;font-weight:600;font-size:14px;text-decoration:none}
</style></head><body><div class="wrap">
  <h1>${strings.title}</h1>
  <p>${strings.body}<br><code>${target}</code><br>(${code} ${safeDesc})</p>
  <a href="${target}">${strings.retry}</a>
</div></body></html>`;
};

const customUiMenu = (): MenuItemConstructorOptions[] => {
    if (!isCustomUiActive()) return [];
    return [
        {
            label: 'Custom UI',
            submenu: [
                {
                    label: 'Reset custom UI',
                    accelerator: 'CommandOrControl+Alt+R',
                    click: () => {
                        disableCustomUi();
                        if (trayWindow && !trayWindow.isDestroyed()) reloadForCustomUiChange(trayWindow);
                    },
                },
            ],
        },
    ];
};

const buildAppMenu = (): Menu => {
    const isMac = process.platform === 'darwin';
    const labels = menuLabels(app.getLocale());
    const viewSubmenu: MenuItemConstructorOptions[] = [
        { role: 'reload' },
        { type: 'separator' },
        {
            label: labels.resetZoom,
            click: () => {
                BrowserWindow.getFocusedWindow()?.webContents.setZoomLevel(0);
            },
        },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
    ];
    const settingsItem: MenuItemConstructorOptions = {
        label: isMac ? `${labels.settings}…` : labels.settings,
        accelerator: 'CommandOrControl+,',
        click: () => openInWeb('settings'),
    };
    const template: MenuItemConstructorOptions[] = [
        ...(isMac
            ? [
                  {
                      role: 'appMenu',
                      submenu: [
                          { role: 'about' },
                          { type: 'separator' },
                          settingsItem,
                          { type: 'separator' },
                          { role: 'services' },
                          { type: 'separator' },
                          { role: 'hide' },
                          { role: 'hideOthers' },
                          { role: 'unhide' },
                          { type: 'separator' },
                          { role: 'quit' },
                      ],
                  } as MenuItemConstructorOptions,
              ]
            : []),
        {
            label: labels.file,
            submenu: isMac ? [{ role: 'close' }] : [settingsItem, { type: 'separator' }, { role: 'close' }],
        },
        { role: 'editMenu' },
        { label: labels.view, submenu: viewSubmenu },
        {
            label: labels.go,
            submenu: [
                {
                    label: labels.back,
                    accelerator: 'CommandOrControl+[',
                    registerAccelerator: false,
                    click: () => {
                        if (mainHost && trayWindow?.isVisible()) pushDeeplink(mainHost, 'chatic-ui:back');
                    },
                },
                {
                    label: labels.forward,
                    accelerator: 'CommandOrControl+]',
                    registerAccelerator: false,
                    click: () => {
                        if (mainHost && trayWindow?.isVisible()) pushDeeplink(mainHost, 'chatic-ui:forward');
                    },
                },
                { type: 'separator' },
                {
                    label: labels.switcher,
                    accelerator: 'CommandOrControl+K',
                    registerAccelerator: false,
                    click: () => openInWeb('switcher'),
                },
                {
                    label: labels.search,
                    accelerator: 'CommandOrControl+Shift+F',
                    registerAccelerator: false,
                    click: () => openInWeb('search'),
                },
            ],
        },
        ...customUiMenu(),
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                {
                    label: labels.shortcuts,
                    accelerator: 'CommandOrControl+/',
                    registerAccelerator: false,
                    click: () => openInWeb('shortcuts'),
                },
            ],
        },
    ];
    return Menu.buildFromTemplate(template);
};

const bindNavigationGates = (win: BrowserWindow): void => {
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url) && !isTrustedUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
        if (!isTrustedUrl(url)) event.preventDefault();
    });
    win.webContents.on('will-frame-navigate', event => {
        if (!isTrustedUrl(event.url)) event.preventDefault();
    });
    win.webContents.on('will-redirect', (event, url) => {
        if (!isTrustedUrl(url)) event.preventDefault();
    });
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
        backgroundColor: '#0b0d10',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            additionalArguments: [
                `--chatic-device-id=${getOrCreateDeviceId()}`,
                `--chatic-stage=${IS_DEV_CHANNEL ? 'dev' : 'prod'}`,
                `--chatic-app-version=${app.getVersion()}`,
                `--chatic-language=${resolveAppLanguage(process.env.VITE_DESKTOP_LANGUAGE || app.getLocale())}`,
            ],
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
        },
    });

    bindNavigationGates(win);

    const host = new AppBridgeHost({
        sendToWeb: (message: string) => win.webContents.send(TO_WEB_CHANNEL, message),
        ...DESKTOP_MAIN_HOST_OPTIONS,
    });
    mainHost = host;
    registerHandlers(host, {
        showNotification: params => showOsNotification(host, win, params),
        awaitFcmToken,
        setBadgeCount: (count, overlayIconDataUrl) => setBadgeCount(win, count, overlayIconDataUrl),
        secureStorage,
        subWebView: subWebViewService,
    });

    const stopForwardingSubWebView = forwardSubWebViewClosed(subWebViewService, host);
    const detachSubWebView = attachDesktopSubWebView(win, subWebViewService, {
        preloadPath: join(__dirname, '../preload/subWebView.js'),
        appVersion: app.getVersion(),
        language: () => resolveAppLanguage(process.env.VITE_DESKTOP_LANGUAGE || app.getLocale()),
        dark: () => nativeTheme.shouldUseDarkColors,
        logPageError: report => console.warn('[sub-webview] page error', report),
        logWarn: (message, detail) => console.warn(`[sub-webview] ${message}`, detail),
    });
    win.once('closed', () => {
        stopForwardingSubWebView();
        detachSubWebView();
    });

    startUpdater(host, () => {
        isQuitting = true;
    });

    void startFcm(readFcmConfig(), {
        onToken: token => {
            onFcmToken(token);
            pushFcmToken(host, token);
        },
        onPush: push => pushFcmMessage(host, push),
    }).catch(error => console.error('[fcm] start failed', error));

    ipcMain.removeAllListeners(TO_APP_CHANNEL);
    ipcMain.on(
        TO_APP_CHANNEL,
        fromTrustedFrame(
            () => undefined,
            (_senderUrl, data: string) => host.handleMessage(data)
        )
    );

    registerCustomUiIpc(win);
    registerLoginItemIpc();
    registerDownloadIpc();

    win.on('resized', () => saveWindowBounds(win));
    win.on('moved', () => saveWindowBounds(win));

    win.on('focus', () => win.flashFrame(false));

    win.on('swipe', (_event, direction) => {
        if (!mainHost) return;
        if (direction === 'left') pushDeeplink(mainHost, 'chatic-ui:back');
        else if (direction === 'right') pushDeeplink(mainHost, 'chatic-ui:forward');
    });

    win.on('close', event => {
        saveWindowBounds(win);
        if (!isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });

    createTray(win);

    win.once('ready-to-show', () => win.show());

    bindLoadRecovery(win);

    let appLoadStarted = false;
    const loadApp = (): void => {
        if (appLoadStarted) return;
        appLoadStarted = true;
        void win.loadURL(resolveWebUrl());
    };
    win.webContents.once('did-finish-load', loadApp);
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`);

    deeplinkHost = host;
    deeplinkWindow = win;

    return win;
};

let recoveryWindow: BrowserWindow | null = null;
let onErrorPage = false;
let resetLoadRetries: () => void = () => undefined;

const reloadWeb = (win: BrowserWindow): void => {
    if (!win.isDestroyed()) void win.loadURL(resolveWebUrl());
};

const showErrorPage = (win: BrowserWindow, code: number, desc: string): void => {
    if (win.isDestroyed()) return;
    onErrorPage = true;
    if (!win.isVisible()) win.show();
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorHtml(code, desc))}`);
};

const recoverFromHang = (win: BrowserWindow): void => {
    if (bundleFailed()) {
        fallbackToRemoteWeb(win, 'renderer unresponsive');
        return;
    }
    reloadWeb(win);
};

const bindPowerResume = (): void => {
    if (powerResumeBound) return;
    powerResumeBound = true;
    powerMonitor.on('resume', () => {
        if (!onErrorPage || !recoveryWindow || recoveryWindow.isDestroyed()) return;
        resetLoadRetries();
        void recoveryWindow.loadURL(resolveWebUrl());
    });
};

const bindLoadRecovery = (win: BrowserWindow): void => {
    recoveryWindow = win;
    onErrorPage = false;

    const RETRYABLE_LOAD_ERRORS = new Set([-102, -106, -105, -118]);
    const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000];
    let loadRetries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let unresponsiveTimer: ReturnType<typeof setTimeout> | undefined;
    const CRASH_RELOAD_LIMIT = 3;
    const CRASH_RELOAD_DELAY_MS = 1000;
    let crashReloads = 0;
    let crashTimer: ReturnType<typeof setTimeout> | undefined;
    resetLoadRetries = () => {
        loadRetries = 0;
    };
    win.webContents.on('did-fail-load', (_event, errorCode, errorDesc, validatedURL, isMainFrame) => {
        if (errorCode === -3) return;
        if (!isMainFrame || !isTrustedUrl(validatedURL)) return;
        if (bundleFailed(validatedURL)) {
            fallbackToRemoteWeb(win, `load failed (${errorCode} ${errorDesc})`);
            return;
        }
        if (RETRYABLE_LOAD_ERRORS.has(errorCode) && loadRetries < RETRY_DELAYS_MS.length) {
            const delay = RETRY_DELAYS_MS[loadRetries];
            loadRetries += 1;
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => reloadWeb(win), delay);
            return;
        }
        showErrorPage(win, errorCode, errorDesc);
    });
    win.webContents.on('did-finish-load', () => {
        if (isTrustedUrl(win.webContents.getURL())) {
            loadRetries = 0;
            if (!isCustomUiActive()) crashReloads = 0;
            onErrorPage = false;
        }
    });
    win.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit') return;
        console.warn('[shell] renderer process gone', details);
        if (crashReloads < CRASH_RELOAD_LIMIT) {
            crashReloads += 1;
            loadRetries = 0;
            if (crashTimer) clearTimeout(crashTimer);
            crashTimer = setTimeout(() => reloadWeb(win), CRASH_RELOAD_DELAY_MS);
            return;
        }
        if (bundleFailed()) {
            crashReloads = 0;
            fallbackToRemoteWeb(win, `renderer ${details.reason}`);
            return;
        }
        showErrorPage(win, 0, `renderer ${details.reason}`);
    });
    win.webContents.on('unresponsive', () => {
        console.warn('[shell] renderer unresponsive');
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        unresponsiveTimer = setTimeout(() => recoverFromHang(win), 15_000);
    });
    win.webContents.on('responsive', () => {
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        unresponsiveTimer = undefined;
    });
    win.on('closed', () => {
        if (retryTimer) clearTimeout(retryTimer);
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        if (crashTimer) clearTimeout(crashTimer);
    });

    bindPowerResume();
};

let deeplinkHost: AppBridgeHost | null = null;
let deeplinkWindow: BrowserWindow | null = null;
let pendingDeeplink: string | null = null;
let powerResumeBound = false;

const handleDeeplink = (url: string): void => {
    if (deeplinkHost && deeplinkWindow) {
        bringToFront(deeplinkWindow);
        pushDeeplink(deeplinkHost, url);
    } else {
        pendingDeeplink = url;
    }
};

const extractDeeplink = (argv: string[]): string | undefined => argv.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}:`));

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
    app.quit();
} else {
    if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [resolve(process.argv[1])]);
    } else {
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
    }

    app.on('second-instance', (_event, argv) => {
        const url = extractDeeplink(argv);
        if (url) handleDeeplink(url);
        else if (deeplinkWindow) bringToFront(deeplinkWindow);
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeeplink(url);
    });

    app.on('before-quit', () => {
        isQuitting = true;
    });

    app.whenReady().then(() => {
        session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
            callback(grantsPermission(permission, details.requestingUrl));
        });

        const downloadTargets = createDownloadTargets(app.getPath('downloads'), existsSync);
        session.defaultSession.on('will-download', (_event, item, webContents) => {
            if (!isTrustedUrl(webContents.getURL())) return;
            item.once('done', (_doneEvent, state) => {
                const savePath = item.getSavePath();
                if (state === 'cancelled' || !savePath || webContents.isDestroyed()) return;
                const name = basename(savePath);
                const done: DownloadDone =
                    state === 'completed'
                        ? { id: downloadLog.record(savePath), name, state }
                        : { name, state: 'interrupted' };
                webContents.send(DOWNLOAD_DONE_CHANNEL, done);
            });
            if (!savesWithoutAsking(item.getFilename(), item.getMimeType())) return;
            const savePath = downloadTargets.reserve(item.getFilename());
            item.setSavePath(savePath);
            item.once('done', (_doneEvent, state) => {
                downloadTargets.release(savePath);
                if (state === 'completed' && process.platform === 'darwin') app.dock?.downloadFinished(savePath);
            });
        });

        const customUiOverride = import.meta.env.MAIN_VITE_CUSTOM_UI_ROOT;
        const overrideServable = !!customUiOverride && hasEntryPoint(customUiOverride);
        const customUiBootSource = customUiBoot(IS_DEV_CHANNEL, customUiOverride, overrideServable);
        if (customUiOverride && !IS_DEV_CHANNEL) {
            console.warn('[shell] MAIN_VITE_CUSTOM_UI_ROOT is ignored off the dev channel', customUiOverride);
        } else if (customUiOverride && !overrideServable) {
            console.warn('[shell] MAIN_VITE_CUSTOM_UI_ROOT has no index.html', customUiOverride);
        }
        if (customUiBootSource.source === 'override') serveCustomUi(customUiBootSource.root);
        else if (customUiBootSource.source === 'restore') restoreCustomUi();
        if (isCustomUiActive()) console.info('[shell] custom UI active', getActiveCustomUiRoot());

        void secureStorage.start();

        Menu.setApplicationMenu(buildAppMenu());
        createWindow();

        registerMacNotifications();

        const coldUrl = pendingDeeplink ?? extractDeeplink(process.argv);
        pendingDeeplink = null;
        if (coldUrl) handleDeeplink(coldUrl);

        app.on('activate', () => {
            const [existing] = BrowserWindow.getAllWindows();
            if (!existing) {
                createWindow();
                return;
            }
            bringToFront(existing);
        });
    });
}
