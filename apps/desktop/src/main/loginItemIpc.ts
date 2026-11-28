import { app, ipcMain } from 'electron';
import {
    createLoginItem,
    LOGIN_ITEM_CHANNEL,
    LOGIN_ITEM_UNSUPPORTED,
    type LaunchAtLoginState,
} from '@chatic/host-desktop';

import { fromTrustedFrame } from './ipcSenderGate';

export const registerLoginItemIpc = (): void => {
    const loginItem = createLoginItem(app, process.platform);
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
