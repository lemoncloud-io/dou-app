import { join } from 'node:path';

import { AppBridgeHost } from '@chatic/bridges';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { IS_DEV_CHANNEL, readFcmConfig } from './appChannel';
import { resolveAppLanguage } from './appLanguage';
import { DESKTOP_MAIN_HOST_OPTIONS, registerHandlers } from './bridgeHandlers';
import { registerBridgeIpc, TO_WEB_CHANNEL } from './bridgeIpc';
import { registerCustomUiIpc } from './customUiIpc';
import { setDeeplinkTarget } from './deeplinks';
import { getOrCreateDeviceId } from './deviceId';
import { registerDownloadIpc } from './downloadsIpc';
import { bindLoadRecovery } from './loadRecovery';
import { registerLoginItemIpc } from './loginItemIpc';
import { createTray } from './menus';
import { bindNavigationGates } from './navigationGates';
import { setBadgeCount, showOsNotification } from './osNotifications';
import { awaitFcmToken, startPush } from './push';
import type { SecureStorage } from './secureStorage';
import { pushDeeplink, pushFcmMessage, pushFcmToken } from './shellEvents';
import { shellState } from './shellState';
import { type DesktopSubWebViewService, forwardSubWebViewClosed } from './subWebView/DesktopSubWebViewService';
import { attachDesktopSubWebView } from './subWebView/desktopSubWebViewWindow';
import { startUpdater } from './updater';
import { resolveWebUrl } from './webUrl';
import { BOUNDS_MIN_HEIGHT, BOUNDS_MIN_WIDTH, loadWindowBounds, saveWindowBounds } from './windowBounds';

export interface MainWindowDeps {
    secureStorage: SecureStorage;
    subWebViewService: DesktopSubWebViewService;
}

const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0b0d10}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
  .ring{width:38px;height:38px;border:3px solid #23272e;border-top-color:#8fbf2e;border-radius:50%;animation:spin .8s linear infinite}
  .label{color:#5b616b;font-size:13px;letter-spacing:.04em}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.ring{animation:none}}
</style></head><body><div class="wrap"><div class="ring"></div><div class="label">Loading DoU…</div></div></body></html>`;

export const createWindow = ({ secureStorage, subWebViewService }: MainWindowDeps): BrowserWindow => {
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
    shellState.mainHost = host;
    registerHandlers(host, {
        showNotification: params => showOsNotification(win, params, deeplink => pushDeeplink(host, deeplink)),
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
        shellState.isQuitting = true;
    });

    startPush(readFcmConfig(), {
        onToken: token => pushFcmToken(host, token),
        onPush: push => pushFcmMessage(host, push),
    });

    registerBridgeIpc(host);

    registerCustomUiIpc(win);
    registerLoginItemIpc();
    registerDownloadIpc();

    win.on('resized', () => saveWindowBounds(win));
    win.on('moved', () => saveWindowBounds(win));

    win.on('focus', () => win.flashFrame(false));

    win.on('swipe', (_event, direction) => {
        if (!shellState.mainHost) return;
        if (direction === 'left') pushDeeplink(shellState.mainHost, 'chatic-ui:back');
        else if (direction === 'right') pushDeeplink(shellState.mainHost, 'chatic-ui:forward');
    });

    win.on('close', event => {
        saveWindowBounds(win);
        if (!shellState.isQuitting) {
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

    setDeeplinkTarget(host, win);

    return win;
};
