import type { AppIconOption, HapticKind, OnUpdateStatusPayload, PreferenceKey } from '@chatic/bridge-messages';

import type { HostOs, ShellOrBrowser } from './ports';

/**
 * Who runs the frame around the page: the app icon and badge, haptics, the back gesture, the
 * keyboard, theme and language sync with the shell, the update check, and the app's return to the
 * foreground. `shell` — the app does, and `os` names its phone platform where one applies; `browser` —
 * there is no frame beyond the browser's, and `os` is `null`.
 *
 * What only some frames have is a member that is `null` where the frame lacks it, so a feature asks
 * for the member, not for the side. The phone app and the desktop app are both shells and differ in
 * what they do — the phone reads its icon badge and checks its store for an update, the desktop paints
 * its dock badge and downloads its own update — so each fills the members its frame has and leaves the
 * rest `null`.
 */
export interface AppShellPort {
    readonly kind: ShellOrBrowser;
    readonly os: HostOs;
    /**
     * Whether the page owns the window it is in: the app opened that window for this page alone, so the
     * page may recover on its own — force-close a socket that died in the background, reload itself when
     * the socket stays wedged — without taking anything from the person. `false` in a browser tab: the
     * tab is the person's, and a reload or a dropped socket they did not ask for loses what they were
     * doing there.
     */
    readonly ownsWindow: boolean;
    /**
     * Whether the frame reports the soft keyboard's height to the page (`--keyboard-height`) as the
     * keyboard moves. Where it does, a field holding focus stands for a keyboard that is up or coming —
     * Android reports the height only once the keyboard is up — and the page can wait for the height to
     * arrive. A browser never reports one, so there is nothing to wait for.
     */
    readonly reportsKeyboardHeight: boolean;
    /**
     * A short buzz under a gesture. `null` where the frame has none: WebKit implements no
     * `navigator.vibrate`, so the page cannot make one itself.
     */
    readonly haptics: AppShellHaptics | null;
    /**
     * The frame's own preference store, which its surfaces — status bar, root background, alert copy,
     * push banners — read instead of the page's settings. `null` where there is no such store.
     */
    readonly preferences: ShellPreferenceStore | null;
    /**
     * The frame's back button or gesture, told whether the page still has something to close. `null`
     * where back is the browser's own.
     */
    readonly backGesture: ShellBackGesture | null;
    /** The number on the app icon, read back from the device. `null` where it cannot be read. */
    readonly iconBadge: ReadableIconBadge | null;
    /** The number on the dock or taskbar icon, painted by the app. `null` where there is none to paint. */
    readonly dockBadge: PaintableDockBadge | null;
    /** The app's alternate icons. `null` where the app's icon cannot be changed from the page. */
    readonly appIcon: AlternateAppIcon | null;
    /**
     * A newer build in the app store, checked on demand, and the store's listing to get it. `null`
     * where the app is not installed from a store the page can check.
     */
    readonly storeUpdate: StoreUpdate | null;
    /**
     * The app's own updater, which announces a new build and downloads and installs it once the person
     * agrees. `null` where the app does not update itself.
     */
    readonly selfUpdate: SelfUpdate | null;
    /**
     * The app's own page in the OS settings, where the person grants a permission the OS will no
     * longer ask for. `null` where the frame has no such page to open: a browser, whose permissions are
     * the browser's, and the desktop app, whose OS keeps no per-app settings page the app can open.
     */
    readonly systemSettings: SystemSettingsPage | null;
}

/** The frame's haptics. */
export interface AppShellHaptics {
    /** Plays `kind`. One-way: never waits for the frame, never throws. */
    play(kind: HapticKind): void;
}

/** The frame's own preference store. */
export interface ShellPreferenceStore {
    /** Writes `value` under `key` and resolves once the frame confirms it. Rejects on a refusal or a timeout. */
    save(key: PreferenceKey, value: unknown): Promise<void>;
    /** The value the frame holds under `key`; `null` or `undefined` when it holds none. */
    read(key: PreferenceKey): Promise<unknown>;
}

/** The frame's back button or gesture. */
export interface ShellBackGesture {
    /**
     * Tells the frame whether a back press is the page's to spend — an overlay is open, or the page has
     * an entry of its own history to rewind to — or the frame's own.
     */
    setCanGoBack(canGoBack: boolean): void;
}

/** An app icon badge the page can read. */
export interface ReadableIconBadge {
    /**
     * The value the device is showing, or `null` when it cannot be known — never 0 for "unknown", since
     * 0 is a real badge. A failed read is `null` for that read only.
     */
    read(): Promise<number | null>;
}

/** A dock or taskbar badge the page paints. */
export interface PaintableDockBadge {
    /**
     * Shows `count` on the icon; 0 clears it. `overlayIconDataUrl` is a PNG the frame shows where the
     * OS has no numeric badge (Windows' taskbar overlay). Best-effort: resolves with the frame's raw
     * answer, which only a log reads, and rejects if the request fails.
     */
    set(count: number, overlayIconDataUrl?: string): Promise<unknown>;
}

/** The app's alternate icons. */
export interface AlternateAppIcon {
    /** The icon in use and whether this device can change it; `null` when the app did not answer. */
    current(): Promise<{ iconName: string; supported: boolean } | null>;
    /** The icons on offer; `null` when the app did not answer. */
    options(): Promise<AppIconOption[] | null>;
    /**
     * Switches to `iconName` (`null` for the primary icon). Resolves with the icon the app says it
     * applied — which may be `undefined` for the primary — or `null` when it did not change.
     */
    change(iconName: string | null): Promise<{ iconName: string | undefined } | null>;
}

/** A newer build in the app store. */
export interface StoreUpdate {
    /** Asks the store for its live version. Rejects if the request fails. */
    check(): Promise<{ updateAvailable: boolean; latestVersion: string }>;
    /** Opens the app's listing in the store. */
    openStore(): void;
}

/** The app's own page in the OS settings. */
export interface SystemSettingsPage {
    /**
     * Opens it. One-way: the OS reports nothing back, and the page learns of a granted permission only by
     * asking again.
     */
    open(): void;
}

/** The app's own updater. */
export interface SelfUpdate {
    /** Calls `listener` with each status the updater announces. Returns the unsubscribe. */
    onStatus(listener: (status: OnUpdateStatusPayload) => void): () => void;
    /** Starts downloading the announced build. Progress arrives through `onStatus`. */
    startDownload(): void;
    /** Quits and installs the downloaded build. */
    restart(): void;
}
