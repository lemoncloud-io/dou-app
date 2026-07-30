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

/**
 * Reply to every launch-at-login request. Mirrors `LaunchAtLoginState` in
 * `apps/desktop/src/main/loginItemContract.ts` — same hand-sync caveat as CustomUiStatus.
 *
 * `enabled` is always the OS read back, never the requested value: macOS 13+ can answer a
 * registration with `requires-approval` and leave the app unregistered, so echoing the request
 * would show a switch that is on while the app will not actually start.
 */
export interface LaunchAtLoginState {
    enabled: boolean;
    /** False where Electron has no login-item integration (Linux) — the UI hides the row. */
    supported: boolean;
}

/** Desktop-only launch-at-login control. */
export interface LaunchAtLoginApi {
    get: () => Promise<LaunchAtLoginState>;
    set: (enabled: boolean) => Promise<LaunchAtLoginState>;
}

declare global {
    interface Window {
        electronAPI?: {
            appVersion: string;
            platform: string;
            customUi?: CustomUiApi;
            loginItem?: LaunchAtLoginApi;
        };
    }
}

/** The custom-UI controls, or undefined outside the desktop shell. */
export const getCustomUiApi = (): CustomUiApi | undefined =>
    typeof window === 'undefined' ? undefined : window.electronAPI?.customUi;

/** The launch-at-login controls, or undefined outside the desktop shell. */
export const getLoginItemApi = (): LaunchAtLoginApi | undefined =>
    typeof window === 'undefined' ? undefined : window.electronAPI?.loginItem;
