/**
 * Wire contract for the launch-at-login channel, shared by main and preload.
 *
 * Same reasoning as `customUiContract.ts`: both sides are compiled by the same tsconfig, so
 * the channel name and the reply shape live in one electron-free file. The renderer half is
 * declared separately in `apps/desktop-web` (Nx blocks app→app imports) and kept in sync by
 * hand — change one, change the other.
 */

/** IPC channel for the launch-at-login toggle. One channel, so main gates the origin once. */
export const LOGIN_ITEM_CHANNEL = 'chatic-login-item';

/** Reply to every launch-at-login request. */
export interface LaunchAtLoginState {
    /** Whether the OS will start the app at login. Read back from the OS, never assumed. */
    enabled: boolean;
    /** False where Electron has no login-item integration (Linux) — the UI hides the toggle. */
    supported: boolean;
}
