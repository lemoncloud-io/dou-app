import { type BrowserWindow, shell } from 'electron';
import { isTrustedUrl } from './webUrl';

export const bindNavigationGates = (win: BrowserWindow): void => {
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
