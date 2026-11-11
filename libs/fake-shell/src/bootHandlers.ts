import type { ShellHandlerTable } from './handlerTable';

/**
 * Which WebView a fake shell imitates. They differ in one thing the web can see: react-native-webview
 * dispatches a native → web message on `window` on iOS and on `document` on Android, and the web
 * listens on both — so each platform runs the path its WebView takes.
 */
export type ShellPlatform = 'ios' | 'android';

/** Where a shell → web message is dispatched on each platform, as react-native-webview does it. */
export const dispatchTarget = (platform: ShellPlatform): 'window' | 'document' =>
    platform === 'ios' ? 'window' : 'document';

/**
 * The app version a fake shell reports: current, so no update prompt covers a scenario and the web's
 * version floor lets it in. Keep it at or above `APP_VERSION_FLOOR` in apps/web.
 */
export const FAKE_SHELL_APP_VERSION = '0.31.2';

/**
 * Answers every app build gives at boot, so a fake shell starts as an app that is up to date and has
 * nothing pending. A caller overrides what it is about.
 *
 * What is left out answers `NOT_FOUND` — the photo grid (`ListPhotos`), file transfers, push tokens, the
 * per-channel chat preview. Every app at the web's version floor handles these, so the web has no
 * fallback for them any more: a scenario that reaches one adds its handler, and one that does not
 * simply never opens that screen.
 */
export const bootHandlers = (platform: ShellPlatform): ShellHandlerTable => ({
    // Posted and never read back: the real handlers answer nothing.
    SendLog: () => undefined,
    SetDebugMode: () => undefined,
    SetBadgeCount: () => undefined,
    // Posted too, but the real handlers do answer (`useWebViewNavigation`, `useAppStateHandler`).
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
