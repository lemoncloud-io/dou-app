import { contextBridge, ipcRenderer, webFrame } from 'electron';

import { CUSTOM_UI_CHANNEL, type CustomUiStatus } from '../main/customUiContract';
import { DOWNLOAD_DONE_CHANNEL, DOWNLOAD_REVEAL_CHANNEL, type DownloadDone } from '../main/downloadsContract';
import { LOGIN_ITEM_CHANNEL, type LaunchAtLoginState } from '../main/loginItemContract';
import { DESKTOP_STORAGE_MEDIA } from '../main/secureStorage/constants';
import { utf8ToBase64 } from './base64';

const TO_WEB_CHANNEL = 'chatic-bridge:to-web';
const TO_APP_CHANNEL = 'chatic-bridge:to-app';

const argValue = (name: string): string => {
    const prefix = `--${name}=`;
    const arg = process.argv.find(a => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : '';
};
const deviceId = argValue('chatic-device-id');
const stage = argValue('chatic-stage') || 'dev';
const appVersion = argValue('chatic-app-version') || '0.0.1';
const language = argValue('chatic-language') || 'en';

const deviceInfo = {
    CHATIC_APP_PLATFORM: 'desktop',
    CHATIC_APP_APPLICATION: 'chatic-desktop',
    CHATIC_APP_STAGE: stage,
    CHATIC_APP_DEVICE_ID: deviceId,
    CHATIC_APP_DEVICE_MODEL: process.platform,
    CHATIC_APP_CURRENT_VERSION: appVersion,
    CHATIC_APP_BUILD_NUMBER: '1',
    CHATIC_APP_CURRENT_LANGUAGE: language,
    CHATIC_APP_INSTALLATION_ID: deviceId,
    CHATIC_APP_LATEST_VERSION: appVersion,
    CHATIC_APP_SHOULD_UPDATE: 'false',
    CHATIC_APP_STORAGE_MEDIA: DESKTOP_STORAGE_MEDIA,
    CHATIC_APP_CAPABILITIES: { version: 1, checkout: [] },
} as const;

contextBridge.exposeInMainWorld('ChaticMessageHandler', {
    postMessage: (message: string) => ipcRenderer.send(TO_APP_CHANNEL, message),
});

contextBridge.exposeInMainWorld('electronAPI', {
    appVersion,
    platform: process.platform,
    customUi: {
        ...(argValue('chatic-stage') === 'dev' && {
            apply: (zipUrl: string): Promise<CustomUiStatus> =>
                ipcRenderer.invoke(CUSTOM_UI_CHANNEL, { action: 'apply', zipUrl }),
        }),
        disable: (): Promise<CustomUiStatus> => ipcRenderer.invoke(CUSTOM_UI_CHANNEL, { action: 'disable' }),
        status: (): Promise<CustomUiStatus> => ipcRenderer.invoke(CUSTOM_UI_CHANNEL, { action: 'status' }),
    },
    loginItem: {
        get: (): Promise<LaunchAtLoginState> => ipcRenderer.invoke(LOGIN_ITEM_CHANNEL, { action: 'get' }),
        set: (enabled: boolean): Promise<LaunchAtLoginState> =>
            ipcRenderer.invoke(LOGIN_ITEM_CHANNEL, { action: 'set', enabled }),
    },
    downloads: {
        onDone: (listener: (done: DownloadDone) => void): (() => void) => {
            const handler = (_event: unknown, done: DownloadDone) => listener(done);
            ipcRenderer.on(DOWNLOAD_DONE_CHANNEL, handler);
            return () => ipcRenderer.removeListener(DOWNLOAD_DONE_CHANNEL, handler);
        },
        reveal: (id: string): Promise<boolean> => ipcRenderer.invoke(DOWNLOAD_REVEAL_CHANNEL, id),
    },
});

const deviceInfoBase64 = utf8ToBase64(JSON.stringify(deviceInfo));

webFrame.executeJavaScript(
    `(() => {` +
        `const info = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("${deviceInfoBase64}"), c => c.charCodeAt(0))));` +
        `Object.assign(window, info);` +
        `})();`
);

ipcRenderer.on(TO_WEB_CHANNEL, (_event, data: string) => {
    if (typeof data !== 'string') return;
    const base64 = utf8ToBase64(data);
    webFrame.executeJavaScript(
        `window.dispatchEvent(new MessageEvent('message', {` +
            `data: new TextDecoder().decode(Uint8Array.from(atob("${base64}"), c => c.charCodeAt(0)))` +
            `}));`
    );
});
