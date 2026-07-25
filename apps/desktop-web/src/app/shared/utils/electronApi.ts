/**
 * The one declaration of what the Electron shell's preload exposes on `window`.
 *
 * Declared in a single place because `declare global` merges across the whole program: two
 * files each asserting their own shape for `window.electronAPI` is a compile error (TS2717),
 * and `vite build` does not typecheck, so it surfaces late. Everything the preload exposes
 * (apps/desktop/src/preload/index.ts) belongs here; features import the types instead.
 *
 * Absent in a plain browser — every field is reached through the optional `electronAPI`.
 *
 * The main-process half of the custom-UI contract lives in
 * `apps/desktop/src/main/customUiContract.ts`. Nx blocks app→app imports and a shared lib for
 * three fields would be YAGNI, so the two are kept in sync by hand. Change one, change the
 * other. Note nothing typechecks that the preload's `exposeInMainWorld` object satisfies the
 * declaration below — that gap is inherent to contextBridge.
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
