import type { AppShellPort } from '../../api';

export const browserAppShell = (): AppShellPort => ({
    kind: 'browser',
    os: null,
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
});
