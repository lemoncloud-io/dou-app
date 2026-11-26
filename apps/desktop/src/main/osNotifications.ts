import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, type BrowserWindow, nativeImage, Notification } from 'electron';
import { bringToFront } from './bringToFront';

const notifRegisteredFile = (): string => join(app.getPath('userData'), 'chatic-notifications-registered');

export const registerMacNotifications = (): void => {
    if (process.platform !== 'darwin' || !Notification.isSupported()) return;
    if (existsSync(notifRegisteredFile())) return;
    try {
        new Notification({ title: 'DoU', body: 'Notifications are enabled.', silent: true }).show();
        writeFileSync(notifRegisteredFile(), '1');
    } catch {
        return;
    }
};

export const showOsNotification = (
    win: BrowserWindow,
    params: { title: string; body: string; deeplink?: string },
    openDeeplink: (deeplink: string) => void
): void => {
    const { title, body, deeplink } = params;
    if (Notification.isSupported()) {
        const notification = new Notification({ title, body });
        notification.on('click', () => {
            bringToFront(win);
            if (deeplink) openDeeplink(deeplink);
        });
        notification.show();
    }
    if (!win.isFocused()) {
        if (process.platform === 'darwin') app.dock?.bounce('informational');
        else win.flashFrame(true);
    }
};

export const setBadgeCount = (win: BrowserWindow, count: number, overlayIconDataUrl?: string): boolean => {
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
