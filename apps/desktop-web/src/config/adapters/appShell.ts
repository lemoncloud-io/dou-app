import { webClient } from '@chatic/bridges';
import { appShellAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-web';

/**
 * Who runs the frame around the page in desktop-web: the shell or the page. Its shell is the desktop app,
 * reached through `webClient` requests; the page uses what any browser offers.
 *
 * The desktop app owns the window the page fills, paints the unread count on its dock or taskbar icon,
 * and downloads and installs its own updates once the person agrees. It has no haptics, no soft
 * keyboard, no back gesture, no preference store of its own, no readable icon badge, no alternate icons,
 * no store to check and no page of its own in the OS settings to open. A browser tab has none of it,
 * and the tab is the person's, not the page's.
 */
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
            // post() takes ONE {type, data} object — the two-arg form type-errors and, worse,
            // silently no-ops at runtime (message.type reads undefined, no handler matches).
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

/** `appShell.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: appShellHost, shell: appShellShell, browser: appShellBrowser } = appShellAdapters(desktopAppShell);
