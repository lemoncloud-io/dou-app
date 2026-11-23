import { webClient } from '@chatic/bridges';
import { appShellAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';

export const webAppShell: ShellOrBrowserImplementations<'appShell'> = {
    shell: base => ({
        ...base,
        ownsWindow: true,
        reportsKeyboardHeight: true,
        haptics: { play: kind => appBridge.postHaptic(kind) },
        preferences: {
            save: async (key, value) => {
                await appBridge.savePreferenceConfirmed({ key, value });
            },
            read: async key => (await appBridge.fetchPreference({ key })).data.value,
        },
        backGesture: { setCanGoBack: canGoBack => appBridge.setCanGoBack(canGoBack) },
        iconBadge: {
            read: async () => {
                try {
                    if (base.os === 'ios') {
                        const response = await appBridge.fetchBadgeCount();
                        if (!response?.success) return null;
                        return response.data?.count ?? null;
                    }
                    const response = await appBridge.fetchBadgeBase();
                    if (!response?.success) return null;
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
        systemSettings: { open: () => appBridge.openSettings() },
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

export const { host: appShellHost, shell: appShellShell, browser: appShellBrowser } = appShellAdapters(webAppShell);
