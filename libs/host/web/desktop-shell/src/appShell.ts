import type { AppShellPort } from '@chatic/ports';

import type { DesktopShellBridge } from './bridge';

export const desktopShellAppShell =
    (bridge: DesktopShellBridge) =>
    (base: Pick<AppShellPort, 'kind' | 'os'>): AppShellPort => ({
        ...base,
        ownsWindow: true,
        reportsKeyboardHeight: false,
        haptics: null,
        preferences: null,
        backGesture: null,
        iconBadge: null,
        dockBadge: {
            set: (count, overlayIconDataUrl) =>
                bridge.request({ type: 'SetBadgeCount', data: { count, overlayIconDataUrl } }),
        },
        appIcon: null,
        storeUpdate: null,
        selfUpdate: {
            onStatus: listener =>
                bridge.onEvent('OnUpdateStatus', message => {
                    const data = message.data;
                    if (!data) return;
                    listener(data);
                }),
            startDownload: () => bridge.post({ type: 'StartUpdateDownload', data: {} }),
            restart: () => bridge.post({ type: 'RestartToUpdate', data: {} }),
        },
        systemSettings: null,
    });
