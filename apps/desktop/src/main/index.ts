import { app, BrowserWindow, Menu, protocol } from 'electron';
import { applyDevChannelIdentity, DESKTOP_WEB_URL } from './appChannel';
import { bringToFront } from './bringToFront';
import { bootCustomUi } from './customUiIpc';
import { CUSTOM_UI_SCHEME_PRIVILEGES } from './customUiProtocol';
import { bindDeeplinkEvents, openColdDeeplink, registerProtocolClient } from './deeplinks';
import { createDeviceVault } from './deviceVault';
import { bindDownloads } from './downloadsIpc';
import { createWindow, type MainWindowDeps } from './mainWindow';
import { buildAppMenu } from './menus';
import { registerMacNotifications } from './osNotifications';
import { bindPermissionRequests } from './sessionPermissions';
import { shellState } from './shellState';
import { DesktopSubWebViewService } from './subWebView/DesktopSubWebViewService';
import { initWebUrl } from './webUrl';

applyDevChannelIdentity();

initWebUrl(DESKTOP_WEB_URL);

protocol.registerSchemesAsPrivileged([CUSTOM_UI_SCHEME_PRIVILEGES]);

const subWebViewService = new DesktopSubWebViewService(error => console.error('[sub-webview] listener threw', error));

const secureStorage = createDeviceVault();

const windowDeps: MainWindowDeps = { secureStorage, subWebViewService };

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
    app.quit();
} else {
    registerProtocolClient();

    bindDeeplinkEvents();

    app.on('before-quit', () => {
        shellState.isQuitting = true;
    });

    app.whenReady().then(() => {
        bindPermissionRequests();
        bindDownloads();
        bootCustomUi();

        void secureStorage.start();

        Menu.setApplicationMenu(buildAppMenu());
        createWindow(windowDeps);

        registerMacNotifications();

        openColdDeeplink();

        app.on('activate', () => {
            const [existing] = BrowserWindow.getAllWindows();
            if (!existing) {
                createWindow(windowDeps);
                return;
            }
            bringToFront(existing);
        });
    });
}
