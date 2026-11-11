/**
 * The sub view's preload — never the main window's. It gives a page on the opened origin the two
 * things the page SDK looks for, and nothing else of the shell:
 *
 * - `window.ChaticSubWebView`, the page's context, frozen;
 * - `window.ReactNativeWebView.postMessage`, the channel the SDK already speaks to the phone shell,
 *   so a page built for the phone runs here unchanged. Replies arrive as `message` events on `window`.
 *
 * On any other origin it defines neither: a page that reached another site (it cannot navigate there,
 * but a redirect is not this file's to prevent) finds no channel and no `params`. Main checks the
 * sender's origin again before it hears a message.
 */
import { contextBridge, ipcRenderer, webFrame } from 'electron';

import {
    SUB_WEBVIEW_BOOT_CHANNEL,
    SUB_WEBVIEW_TO_APP_CHANNEL,
    SUB_WEBVIEW_TO_WEB_CHANNEL,
} from '../main/subWebView/subWebViewContract';

// Imports nothing of the main window's preload, `./base64` included: the two preloads are built
// together, and a module they share becomes a chunk of its own that a sandboxed preload cannot load.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const readBoot = (): { origin: string; script: string } | null => {
    // Synchronous, so the context is defined before the page's first script runs.
    const boot: unknown = ipcRenderer.sendSync(SUB_WEBVIEW_BOOT_CHANNEL);
    if (!boot || typeof boot !== 'object') return null;
    const { origin, script } = boot as { origin?: unknown; script?: unknown };
    return typeof origin === 'string' && typeof script === 'string' ? { origin, script } : null;
};

const boot = readBoot();

if (boot && window.location.origin === boot.origin) {
    // The script checks the origin itself as well, and defines the context in the page's own world.
    void webFrame.executeJavaScript(boot.script);

    contextBridge.exposeInMainWorld('ReactNativeWebView', {
        postMessage: (message: unknown) => {
            if (typeof message === 'string') ipcRenderer.send(SUB_WEBVIEW_TO_APP_CHANNEL, message);
        },
    });

    // Main sends each message base64-encoded, and it is delivered in the page's world still encoded,
    // so the message never takes part in the script's grammar. Anything else on the channel is dropped.
    ipcRenderer.on(SUB_WEBVIEW_TO_WEB_CHANNEL, (_event, base64: unknown) => {
        if (typeof base64 !== 'string' || !BASE64.test(base64)) return;
        void webFrame.executeJavaScript(
            `window.dispatchEvent(new MessageEvent('message', {` +
                `data: new TextDecoder().decode(Uint8Array.from(atob("${base64}"), c => c.charCodeAt(0)))` +
                `}));`
        );
    });
}
