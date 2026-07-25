/**
 * The one declaration of what the Electron shell's preload exposes on `window`.
 *
 * Declared in a single place because `declare global` merges across the whole program: two
 * files each asserting their own shape for `window.electronAPI` is a compile error (TS2717),
 * and `vite build` does not typecheck, so it surfaces late. Everything the preload exposes
 * (apps/desktop/src/preload/index.ts) belongs here; features import the types instead.
 *
 * Absent in a plain browser — every field is reached through the optional `electronAPI`.
 */

/** Result of every custom-UI request; `error` is set instead of rejecting so the caller can show it. */
export interface CustomUiStatus {
    active: boolean;
    root: string | null;
    error?: string;
}

/** Desktop-only custom-web-bundle PoC controls. */
export interface CustomUiApi {
    apply: (zipUrl: string) => Promise<CustomUiStatus>;
    disable: () => Promise<CustomUiStatus>;
    status: () => Promise<CustomUiStatus>;
}

declare global {
    interface Window {
        electronAPI?: {
            appVersion: string;
            platform: string;
            customUi?: CustomUiApi;
        };
    }
}

/** The custom-UI controls, or undefined outside the desktop shell. */
export const getCustomUiApi = (): CustomUiApi | undefined =>
    typeof window === 'undefined' ? undefined : window.electronAPI?.customUi;
