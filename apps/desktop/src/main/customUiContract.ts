/**
 * Wire contract for the custom-UI PoC channel, shared by main and preload.
 *
 * Both sides are compiled by the same tsconfig, so keeping the channel name and the reply
 * shape here means a rename cannot silently break the other half. Electron-free, so preload
 * pulls nothing from the main bundle.
 */

/** IPC channel for the custom-UI PoC controls. One channel, so main gates the origin once. */
export const CUSTOM_UI_CHANNEL = 'chatic-custom-ui';

/** Result of every custom-UI request; `error` is set instead of rejecting so the panel can show it. */
export interface CustomUiStatus {
    active: boolean;
    root: string | null;
    error?: string;
}
