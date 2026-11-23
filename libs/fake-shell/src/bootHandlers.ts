import type { ShellHandlerTable } from './handlerTable';

export type ShellPlatform = 'ios' | 'android';

export const dispatchTarget = (platform: ShellPlatform): 'window' | 'document' =>
    platform === 'ios' ? 'window' : 'document';

export const FAKE_SHELL_APP_VERSION = '0.31.2';

export const bootHandlers = (platform: ShellPlatform): ShellHandlerTable => ({
    SendLog: () => undefined,
    SetDebugMode: () => undefined,
    SetBadgeCount: () => undefined,
    SetCanGoBack: () => ({}),
    DismissResumeOverlay: () => ({}),
    FirstScreenReady: () => undefined,
    SendBootMetrics: () => undefined,
    StartPerfTrace: () => undefined,
    StopPerfTrace: () => undefined,
    CheckAppUpdate: () => ({
        platform,
        currentVersion: FAKE_SHELL_APP_VERSION,
        latestVersion: FAKE_SHELL_APP_VERSION,
        updateAvailable: false,
        storeUrl: '',
    }),
    FetchPreference: data => ({ key: data.key, value: null }),
    FetchBadgeBase: () => ({ base: 0 }),
    FetchPushMarks: () => ({ marks: [] }),
    FetchPendingReports: () => ({ reports: [] }),
});
