/**
 * The functional areas a tag can belong to, grouped as the trigger catalogue groups them.
 *
 * A tag names one event as `<area>.<event>` — `socket.reconnect_failed`. The area is never written
 * separately: the wire mapper cuts it off the tag ({@link logAreaOf}), so the two cannot disagree.
 * The server can only match a field exactly, so without an area of its own "every socket log" could
 * not be selected once tags name events.
 *
 * **Mirrors the catalogue, and is not itself the source of truth** — the same rule as
 * `KNOWN_LOG_TAGS`. An area is a feature area, never a file, module or hook name: an invite failure
 * raised inside an auth hook is still `invite.*`.
 *
 * The root `eslint.config.mjs` reads this array out of this file to warn about tags outside it, so
 * it stays one literal array of plain strings.
 */
export const LOG_AREAS = [
    // Global · runtime
    'global',
    'app',
    'router',
    'perf',
    'web_vitals',
    'i18n',
    // Transport
    'net',
    'socket',
    'sync',
    'bridge',
    // Session
    'auth',
    'session',
    'cloud',
    // Web domains
    'account',
    'chat',
    'channel',
    'place',
    'profile',
    'invite',
    'search',
    'iap',
    'feedback',
    // Storage
    'cache',
    'storage',
    'sqlite',
    'preference',
    'config',
    'log_buffer',
    // Native capabilities
    'webview',
    'notification',
    'push_event',
    'deeplink',
    'upload',
    'file',
    'device',
    'permission',
    'clipboard',
    'sms',
    'oauth',
    'app_icon',
    'version',
    'firebase',
    'unfurl',
] as const;

/** An area the catalogue names. */
export type LogArea = (typeof LOG_AREAS)[number];

/** Whether `area` is one the catalogue names. For diagnostics and tests — never a runtime gate. */
export const isKnownLogArea = (area: string): area is LogArea => (LOG_AREAS as readonly string[]).includes(area);

/**
 * The area a tag belongs to.
 *
 * Old and new tags are read by one rule, because both stay on the wire for a long time — call
 * sites move over area by area, and an app already installed keeps sending what it was built with:
 *
 * - With a dot (`socket.reconnect_failed`) the area is everything before the first dot, as written.
 * - Without one (`SOCKET`) the whole tag, lower-cased, is the area — so `SOCKET` and
 *   `socket.reconnect_failed` land in the same area and a per-area query spans the switch-over.
 *
 * A leading dot counts as no dot: `.x` has no area before it, and an empty area would be a value no
 * query asks for. An empty tag has no area at all.
 */
export const logAreaOf = (tag: string): string | undefined => {
    if (!tag) return undefined;

    const dot = tag.indexOf('.');
    return dot > 0 ? tag.slice(0, dot) : tag.toLowerCase();
};
