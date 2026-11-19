import type { AppShellPort } from '@chatic/runtime-client';

/**
 * A browser tab's `appShell` port for tests: what the page does on its own, with no runner's mock in it —
 * this file loads under jest and vitest alike. A tab has none of a frame's members and is the person's,
 * not the page's. A test that needs to watch a member lays its own over this one.
 */
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
});
