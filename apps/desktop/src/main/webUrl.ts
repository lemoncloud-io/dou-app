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

/** Origin of `url`, or null when it has none the shell can compare (unparseable input). */
export const safeOrigin = (url: string): string | null => {
    try {
        const { origin } = new URL(url);
        // Non-special schemes (data:, and any custom scheme) stringify their origin as
        // "null" — an opaque origin, never a match for a real one.
        return origin === 'null' ? null : origin;
    } catch {
        return null;
    }
};

let remoteWebUrl = '';
const trustedOrigins = new Set<string>();

/** Bind the Shell to its remote web build. Call once at startup, before any window. */
export const initWebUrl = (remote: string): void => {
    remoteWebUrl = remote;
    trustedOrigins.clear();
    const origin = safeOrigin(remote);
    if (origin) trustedOrigins.add(origin);
};

/** The URL every load site must use. */
export const resolveWebUrl = (): string => remoteWebUrl;

/** Whether `url` belongs to an origin the Shell hands its bridge and navigation to. */
export const isTrustedUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    const origin = safeOrigin(url);
    return origin !== null && trustedOrigins.has(origin);
};
