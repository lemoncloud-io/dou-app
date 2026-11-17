import { hostProfile, type HostProfile } from '@chatic/bridges';

import { hostOsOf, resolveAppOrPage, SHELL_DOMAINS_INTRODUCED_IN, type AppOrPage, type HostOs } from './appOrPage';

/**
 * Who runs the frame around the page: the app icon and badge, haptics, the back gesture, the
 * keyboard, theme and language sync with the shell, the update check, and the app's return to the
 * foreground. `app` — the app does, and `os` names its phone platform where one applies; `page` —
 * there is no frame beyond the browser's, and `os` is `null`.
 */
export interface AppShellPort {
    readonly kind: AppOrPage;
    readonly os: HostOs;
}

export const resolveAppShell = (profile: HostProfile = hostProfile()): AppShellPort => {
    const kind = resolveAppOrPage(profile, 'appShell', SHELL_DOMAINS_INTRODUCED_IN);
    return { kind, os: hostOsOf(profile, kind) };
};
