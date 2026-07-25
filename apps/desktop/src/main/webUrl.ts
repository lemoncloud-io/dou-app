/**
 * Single source of truth for the URL the Shell loads and the origins it trusts.
 *
 * The Shell reaches for the web URL in four places — first load, load-failure retry,
 * post-sleep recovery, and the branded error page's retry link — and gates IPC plus
 * three navigation events on the origin derived from it. Reading the build-time
 * constant at each site means any later change to what gets loaded has to be applied
 * four times, and a missed site fails silently (the recovery path quietly reloads
 * something other than what is on screen). Everything funnels through here instead.
 *
 * Deliberately imports no electron: this runs under jest, which cannot load electron.
 */

/**
 * Scheme the custom-UI bundle is served under. Fixed host, so the origin stays identical
 * across bundle versions — swapping a bundle must not orphan the IndexedDB/localStorage
 * partition the previous one wrote to.
 */
export const CUSTOM_UI_SCHEME = 'chatic-local';
export const CUSTOM_UI_HOST = 'bundle';
export const CUSTOM_UI_ORIGIN = `${CUSTOM_UI_SCHEME}://${CUSTOM_UI_HOST}`;
export const CUSTOM_UI_URL = `${CUSTOM_UI_ORIGIN}/`;

/**
 * Origin of `url`, or null when the shell has nothing it can compare.
 *
 * Chromium knows `chatic-local:` is a standard scheme (registerSchemesAsPrivileged), but
 * main runs on Node's URL, which grants a real origin only to http/https/ws/file — every
 * other scheme, ours included, stringifies as the opaque "null". Assemble ours by hand so
 * it can be matched, and let every other opaque origin stay unmatchable.
 */
export const safeOrigin = (url: string): string | null => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol === `${CUSTOM_UI_SCHEME}:`) {
        // Only the one host we serve. Another host on our scheme is not our bundle.
        return parsed.host === CUSTOM_UI_HOST ? CUSTOM_UI_ORIGIN : null;
    }
    return parsed.origin === 'null' ? null : parsed.origin;
};

let remoteWebUrl = '';
let customUiActive = false;
const trustedOrigins = new Set<string>();

/** Bind the Shell to its remote web build. Call once at startup, before any window. */
export const initWebUrl = (remote: string): void => {
    remoteWebUrl = remote;
    customUiActive = false;
    trustedOrigins.clear();
    const origin = safeOrigin(remote);
    if (origin) trustedOrigins.add(origin);
};

/**
 * Switch the Shell between the remote web build and the custom-UI bundle.
 *
 * The remote origin stays trusted either way: a custom bundle that fails to load falls
 * back to the remote web, and that load must not be refused by the navigation gates.
 */
export const setCustomUiActive = (active: boolean): void => {
    customUiActive = active;
    if (active) trustedOrigins.add(CUSTOM_UI_ORIGIN);
    else trustedOrigins.delete(CUSTOM_UI_ORIGIN);
};

/** Whether the shell is currently pointed at a custom bundle rather than the remote web. */
export const isCustomUiActive = (): boolean => customUiActive;

/**
 * Whether `url` is served by the custom bundle. Independent of activation state, because
 * load-failure handlers are told which URL failed and must classify it either way.
 */
export const isCustomUiUrl = (url: string | undefined): boolean => !!url && safeOrigin(url) === CUSTOM_UI_ORIGIN;

/** The URL every load site must use. */
export const resolveWebUrl = (): string => (customUiActive ? CUSTOM_UI_URL : remoteWebUrl);

/** Whether `url` belongs to an origin the Shell hands its bridge and navigation to. */
export const isTrustedUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    const origin = safeOrigin(url);
    return origin !== null && trustedOrigins.has(origin);
};
