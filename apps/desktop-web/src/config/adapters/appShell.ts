import { webClient } from '@chatic/bridges';
import { appShellAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const desktopAppShell: ShellOrBrowserImplementations<'appShell'> = {
    shell: base => ({
        ...base,
        ownsWindow: true,
        reportsKeyboardHeight: false,
        haptics: null,
        preferences: null,
        backGesture: null,
        iconBadge: null,
        dockBadge: {
            set: (count, overlayIconDataUrl) =>
                webClient.request({ type: 'SetBadgeCount', data: { count, overlayIconDataUrl } }),
        },
        appIcon: null,
        storeUpdate: null,
        selfUpdate: {
            onStatus: listener =>
                webClient.onEvent('OnUpdateStatus', message => {
                    const data = message.data;
                    if (!data) return;
                    listener(data);
                }),
            startDownload: () => webClient.post({ type: 'StartUpdateDownload', data: {} }),
            restart: () => webClient.post({ type: 'RestartToUpdate', data: {} }),
        },
        systemSettings: null,
    }),
    browser: base => ({
        ...base,
        ownsWindow: false,
        reportsKeyboardHeight: false,
        haptics: null,
        preferences: null,
        backGesture: null,
        iconBadge: null,
        dockBadge: null,
        appIcon: null,
        storeUpdate: null,
        selfUpdate: null,
        systemSettings: null,
    }),
};

export const { host: appShellHost, shell: appShellShell, browser: appShellBrowser } = appShellAdapters(desktopAppShell);
