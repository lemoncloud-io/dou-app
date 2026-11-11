// src/types/model/custom-zip.ts

/**
 * Custom web zip — the means by which QA loads a specific web build on a device.
 *
 * The control surface moved from an app screen to the web (ADR-0080, decision 11). **But
 * this command determines, via the zip's URL, the code the WebView will run** — the same
 * class of security concern that decision 13 addressed by removing the ability to change
 * the web URL. So the native handler applies a **fail-closed gate at the build stage**:
 * PROD builds reject it. The check relies on the baked `VITE_ENV`, which the web page can't
 * tamper with, carrying over the same guard (`ALLOW_ENVIRONMENT_SETTINGS`) the app's
 * `FloatingMenu` used to gate entry to this feature.
 */

/** [Request] Download the zip, unpack it, and serve it from a local server. */
export type ApplyCustomZipPayload = {
    /** URL of the zip to download */
    url: string;
};

/** [Response] Apply result. If `serverUrl` is present, the WebView reloads from that address. */
export type OnApplyCustomZipPayload = {
    success: boolean;
    serverUrl: string | null;
};

/** [Request] Turn off the custom zip and revert to the default web build. */
export type DisableCustomZipPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Disable result. */
export type OnDisableCustomZipPayload = {
    success: boolean;
};

/** [Request] Fetch the currently applied custom zip status. */
export type FetchCustomZipStatusPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * [Response] Current status. If `allowed` is false, the feature itself is blocked on this
 * build, so the web side should surface that fact rather than appear to simply fail.
 */
export type OnFetchCustomZipStatusPayload = {
    allowed: boolean;
    localRoot: string | null;
    serverUrl: string | null;
};
