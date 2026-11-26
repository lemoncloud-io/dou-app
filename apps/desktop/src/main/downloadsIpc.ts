import { existsSync } from 'node:fs';
import { basename } from 'node:path';

import { app, ipcMain, session, shell } from 'electron';
import { createDownloadLog, type DownloadLog, createDownloadTargets, savesWithoutAsking } from './downloads';
import { DOWNLOAD_DONE_CHANNEL, DOWNLOAD_REVEAL_CHANNEL, type DownloadDone } from './downloadsContract';
import { fromTrustedFrame } from './ipcSenderGate';
import { isTrustedUrl } from './webUrl';

let downloadLog: DownloadLog | null = null;
const theDownloadLog = (): DownloadLog => (downloadLog ??= createDownloadLog());

export const registerDownloadIpc = (): void => {
    ipcMain.removeHandler(DOWNLOAD_REVEAL_CHANNEL);
    ipcMain.handle(
        DOWNLOAD_REVEAL_CHANNEL,
        fromTrustedFrame(
            () => false,
            (_senderUrl, id: unknown): boolean => {
                const path = theDownloadLog().pathOf(id);
                if (!path || !existsSync(path)) return false;
                shell.showItemInFolder(path);
                return true;
            }
        )
    );
};

export const bindDownloads = (): void => {
    const downloadTargets = createDownloadTargets(app.getPath('downloads'), existsSync);
    session.defaultSession.on('will-download', (_event, item, webContents) => {
        if (!isTrustedUrl(webContents.getURL())) return;
        item.once('done', (_doneEvent, state) => {
            const savePath = item.getSavePath();
            if (state === 'cancelled' || !savePath || webContents.isDestroyed()) return;
            const name = basename(savePath);
            const done: DownloadDone =
                state === 'completed'
                    ? { id: theDownloadLog().record(savePath), name, state }
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
};
