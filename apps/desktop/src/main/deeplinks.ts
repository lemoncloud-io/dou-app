import { resolve } from 'node:path';

import type { AppBridgeHost } from '@chatic/bridges';
import { app, type BrowserWindow } from 'electron';
import { PROTOCOL_SCHEME } from './appChannel';
import { bringToFront } from './bringToFront';
import { pushDeeplink } from './shellEvents';

let deeplinkHost: AppBridgeHost | null = null;
let deeplinkWindow: BrowserWindow | null = null;
let pendingDeeplink: string | null = null;

export const setDeeplinkTarget = (host: AppBridgeHost, win: BrowserWindow): void => {
    deeplinkHost = host;
    deeplinkWindow = win;
};

const handleDeeplink = (url: string): void => {
    if (deeplinkHost && deeplinkWindow) {
        bringToFront(deeplinkWindow);
        pushDeeplink(deeplinkHost, url);
    } else {
        pendingDeeplink = url;
    }
};

const extractDeeplink = (argv: string[]): string | undefined => argv.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}:`));

export const registerProtocolClient = (): void => {
    if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [resolve(process.argv[1])]);
    } else {
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
    }
};

export const bindDeeplinkEvents = (): void => {
    app.on('second-instance', (_event, argv) => {
        const url = extractDeeplink(argv);
        if (url) handleDeeplink(url);
        else if (deeplinkWindow) bringToFront(deeplinkWindow);
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeeplink(url);
    });
};

export const openColdDeeplink = (): void => {
    const coldUrl = pendingDeeplink ?? extractDeeplink(process.argv);
    pendingDeeplink = null;
    if (coldUrl) handleDeeplink(coldUrl);
};
