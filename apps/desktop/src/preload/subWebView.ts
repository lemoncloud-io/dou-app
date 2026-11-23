import { contextBridge, ipcRenderer, webFrame } from 'electron';

import {
    SUB_WEBVIEW_BOOT_CHANNEL,
    SUB_WEBVIEW_TO_APP_CHANNEL,
    SUB_WEBVIEW_TO_WEB_CHANNEL,
} from '../main/subWebView/subWebViewContract';

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const readBoot = (): { origin: string; script: string } | null => {
    const boot: unknown = ipcRenderer.sendSync(SUB_WEBVIEW_BOOT_CHANNEL);
    if (!boot || typeof boot !== 'object') return null;
    const { origin, script } = boot as { origin?: unknown; script?: unknown };
    return typeof origin === 'string' && typeof script === 'string' ? { origin, script } : null;
};

const boot = readBoot();

if (boot && window.location.origin === boot.origin) {
    void webFrame.executeJavaScript(boot.script);

    contextBridge.exposeInMainWorld('ReactNativeWebView', {
        postMessage: (message: unknown) => {
            if (typeof message === 'string') ipcRenderer.send(SUB_WEBVIEW_TO_APP_CHANNEL, message);
        },
    });

    ipcRenderer.on(SUB_WEBVIEW_TO_WEB_CHANNEL, (_event, base64: unknown) => {
        if (typeof base64 !== 'string' || !BASE64.test(base64)) return;
        void webFrame.executeJavaScript(
            `window.dispatchEvent(new MessageEvent('message', {` +
                `data: new TextDecoder().decode(Uint8Array.from(atob("${base64}"), c => c.charCodeAt(0)))` +
                `}));`
        );
    });
}
