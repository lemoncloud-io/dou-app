/**
 * The shapes a page sees, declared here rather than imported: the app's message definitions are a
 * private package, and a published library cannot point at it. `types.contract.test.ts` holds each one
 * equal to its counterpart there, so the two cannot drift apart unnoticed.
 */

export type Theme = 'light' | 'dark';

/** The feel of a haptic: a tick, a tap, or the outcome of something the user did. */
export type HapticKind = 'selection' | 'impact' | 'success' | 'warning' | 'error';

/** What the user did to ask for the close: the app's close control, or Android back. */
export type CloseTrigger = 'control' | 'back';

/** What the app tells the page about where it runs. A snapshot; changes arrive through `onContextChange`. */
export type ChaticAppsContext = {
    /** The protocol major the app speaks. */
    protocolVersion: 1;
    viewId: string;
    platform: 'ios' | 'android';
    /** The app's own version. */
    appVersion: string;
    /** The language the user chose in the app (`ko`, `en`). */
    locale: string;
    /** The app's theme, which can differ from the OS's. */
    theme: Theme;
    /** What whoever opened the page passed it; `{}` when nothing. */
    params: { [key: string]: unknown };
    /** The link that opens this page in the app; absent from older apps. */
    appLink?: string;
};

/** What the page's storage holds and may hold, in characters: keys plus values serialized. */
export type StorageUsage = { used: number; limit: number };

/** Every code the app itself can fail a call with. */
export type AppErrorCode =
    | 'NOT_FOUND'
    | 'INTERNAL_ERROR'
    | 'TOO_LARGE'
    | 'INVALID'
    | 'INVALID_KIND'
    | 'NOT_OPEN'
    | 'LINK_NOT_ALLOWED'
    | 'OPEN_URL_FAILED'
    | 'CLIPBOARD_WRITE_ERROR'
    | 'SHARE_ERROR'
    | 'UNAVAILABLE'
    | 'QUOTA_EXCEEDED'
    | 'SETTINGS_ERROR';

/** A device a page captures from with `getUserMedia`. */
export type DeviceKind = 'camera' | 'microphone';

/**
 * Where the app stands with the OS for one device:
 * - `granted` — `getUserMedia` for it asks nothing further;
 * - `prompt` — the OS has not been asked, or was refused and may be asked again;
 * - `blocked` — only the OS settings can change it (`openSettings()`).
 */
export type PermissionState = 'granted' | 'prompt' | 'blocked';
