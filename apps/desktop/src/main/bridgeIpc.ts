import type { AppBridgeHost } from '@chatic/bridges';
import { ipcMain } from 'electron';
import { fromTrustedFrame } from './ipcSenderGate';

export const TO_WEB_CHANNEL = 'chatic-bridge:to-web';
const TO_APP_CHANNEL = 'chatic-bridge:to-app';

export const registerBridgeIpc = (host: AppBridgeHost): void => {
    ipcMain.removeAllListeners(TO_APP_CHANNEL);
    ipcMain.on(
        TO_APP_CHANNEL,
        fromTrustedFrame(
            () => undefined,
            (_senderUrl, data: string) => host.handleMessage(data)
        )
    );
};
