import { webClient } from '@chatic/bridges';
import { appShellAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';

/**
 * Who runs the frame around the page in the web app: the shell or the page. Its shell is the phone app,
 * reached through `appBridge`; the page uses what any browser offers.
 *
 * The phone app plays haptics, keeps its own preference store for its native surfaces, takes the back
 * gesture, reports the keyboard's height, shows an icon badge the page reads, offers alternate icons,
 * and is updated from its store. It paints no dock badge and does not update itself. A browser tab has
 * none of that: every member it lacks is `null`, and the tab is the person's, not the page's.
 */
export const webAppShell: ShellOrBrowserImplementations<'appShell'> = {
    shell: base => ({
        ...base,
        ownsWindow: true,
        reportsKeyboardHeight: true,
        // Every haptic is a one-way post the shell plays without answering: a reply would be a trip back
        // across the bridge on the UI thread, in the middle of the gesture that asked for it.
        haptics: { play: kind => appBridge.postHaptic(kind) },
        preferences: {
            save: async (key, value) => {
                await appBridge.savePreferenceConfirmed({ key, value });
            },
            read: async key => (await appBridge.fetchPreference({ key })).data.value,
        },
        backGesture: { setCanGoBack: canGoBack => appBridge.setCanGoBack(canGoBack) },
        iconBadge: {
            // Two platforms, two sources. iOS answers the live icon badge, which the app process can read.
            // Android has no readable icon badge — notifee's badge API resolves a constant 0 off iOS — so
            // the count is read from the app's shared counter instead, by a separate message.
            read: async () => {
                try {
                    if (base.os === 'ios') {
                        const response = await appBridge.fetchBadgeCount();
                        // The bridge facade answers the raw response, so a refused round trip can arrive
                        // as `success: false` rather than a rejection. Either way the value is unknown.
                        if (!response?.success) return null;
                        return response.data?.count ?? null;
                    }
                    const response = await appBridge.fetchBadgeBase();
                    if (!response?.success) return null;
                    // `base: null` means "this platform cannot answer".
                    return response.data?.base ?? null;
                } catch {
                    return null;
                }
            },
        },
        dockBadge: null,
        appIcon: {
            current: async () => {
                const response = await webClient.request({ type: 'FetchAppIcon', data: {} });
                if (!response.success || !response.data) return null;
                return { iconName: response.data.iconName, supported: response.data.supported };
            },
            options: async () => {
                const response = await webClient.request({ type: 'FetchAppIconList', data: {} });
                return response.success && response.data ? response.data.availableIcons : null;
            },
            change: async iconName => {
                const response = await webClient.request({ type: 'ChangeAppIcon', data: { iconName } });
                return response.success && response.data?.success ? { iconName: response.data.iconName } : null;
            },
        },
        storeUpdate: {
            check: async () => {
                const { data } = await appBridge.checkAppUpdate();
                return { updateAvailable: data.updateAvailable, latestVersion: data.latestVersion };
            },
            openStore: () => appBridge.openStore(),
        },
        selfUpdate: null,
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
    }),
};

/** `appShell.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: appShellHost, shell: appShellShell, browser: appShellBrowser } = appShellAdapters(webAppShell);
