import { join } from 'node:path';

import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import { IS_DEV_CHANNEL } from './appChannel';
import { bringToFront } from './bringToFront';
import { applyCustomUi, disableCustomUi } from './customUiBundle';
import { menuLabels } from './menuLabels';
import { pushDeeplink } from './shellEvents';
import { shellState } from './shellState';
import { isCustomUiActive, resolveWebUrl } from './webUrl';

let tray: Tray | null = null;
let trayWindow: BrowserWindow | null = null;

const SAMPLE_CUSTOM_UI_ZIP = 'https://lemon-ade-storage.s3.ap-northeast-2.amazonaws.com/custom-web-poc-desktopweb.zip';

const openInWeb = (target: 'settings' | 'shortcuts' | 'switcher' | 'search'): void => {
    const win = trayWindow;
    if (win && !win.isDestroyed()) {
        bringToFront(win);
    }
    if (shellState.mainHost) pushDeeplink(shellState.mainHost, `chatic-ui:${target}`);
};

const stepInWeb = (deeplink: 'chatic-ui:back' | 'chatic-ui:forward'): void => {
    if (shellState.mainHost && trayWindow?.isVisible()) pushDeeplink(shellState.mainHost, deeplink);
};

export const reloadForCustomUiChange = (win: BrowserWindow): void => {
    if (!win.isDestroyed()) void win.loadURL(resolveWebUrl());
    refreshTrayMenu();
    Menu.setApplicationMenu(buildAppMenu());
};

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
                shellState.isQuitting = true;
                app.quit();
            },
        },
    ]);

const refreshTrayMenu = (): void => {
    if (tray && trayWindow && !trayWindow.isDestroyed()) tray.setContextMenu(buildTrayMenu(trayWindow));
};

export const createTray = (win: BrowserWindow): void => {
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

export const buildAppMenu = (): Menu => {
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
                    click: () => stepInWeb('chatic-ui:back'),
                },
                {
                    label: labels.forward,
                    accelerator: 'CommandOrControl+]',
                    registerAccelerator: false,
                    click: () => stepInWeb('chatic-ui:forward'),
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
