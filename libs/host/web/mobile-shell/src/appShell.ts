import type { AppShellPort } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const mobileShellAppShell =
    (bridge: ShellBridge) =>
    (base: Pick<AppShellPort, 'kind' | 'os'>): AppShellPort => ({
        ...base,
        ownsWindow: true,
        reportsKeyboardHeight: true,
        haptics: { play: kind => bridge.post({ type: 'TriggerHaptic', data: { kind } }) },
        preferences: {
            save: async (key, value) => {
                await bridge.request({ type: 'SavePreference', data: { key, value } });
            },
            read: async key => (await bridge.request({ type: 'FetchPreference', data: { key } })).data.value,
        },
        backGesture: {
            setCanGoBack: canGoBack =>
                bridge.post({ type: 'SetCanGoBack', data: { canGoBack, includesHistory: true } }),
        },
        iconBadge: {
            read: async () => {
                try {
                    if (base.os === 'ios') {
                        const response = await bridge.request({ type: 'FetchBadgeCount', data: {} });
                        if (!response?.success) return null;
                        return response.data?.count ?? null;
                    }
                    const response = await bridge.request({ type: 'FetchBadgeBase', data: {} });
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
                const response = await bridge.request({ type: 'FetchAppIcon', data: {} });
                if (!response.success || !response.data) return null;
                return { iconName: response.data.iconName, supported: response.data.supported };
            },
            options: async () => {
                const response = await bridge.request({ type: 'FetchAppIconList', data: {} });
                return response.success && response.data ? response.data.availableIcons : null;
            },
            change: async iconName => {
                const response = await bridge.request({ type: 'ChangeAppIcon', data: { iconName } });
                return response.success && response.data?.success ? { iconName: response.data.iconName } : null;
            },
        },
        storeUpdate: {
            check: async () => {
                const { data } = await bridge.request({ type: 'CheckAppUpdate', data: {} });
                return { updateAvailable: data.updateAvailable, latestVersion: data.latestVersion };
            },
            openStore: () => bridge.post({ type: 'OpenStore', data: {} }),
        },
        selfUpdate: null,
        systemSettings: { open: () => bridge.post({ type: 'OpenSettings', data: {} }) },
    });
