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
    'global',
    'app',
    'router',
    'perf',
    'web_vitals',
    'i18n',
    'net',
    'socket',
    'sync',
    'bridge',
    'auth',
    'session',
    'cloud',
    'account',
    'chat',
    'channel',
    'place',
    'profile',
    'invite',
    'search',
    'iap',
    'feedback',
    'cache',
    'storage',
    'sqlite',
    'preference',
    'config',
    'log_buffer',
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

export type LogArea = (typeof LOG_AREAS)[number];

export const isKnownLogArea = (area: string): area is LogArea => (LOG_AREAS as readonly string[]).includes(area);

export const logAreaOf = (tag: string): string | undefined => {
    if (!tag) return undefined;

    const dot = tag.indexOf('.');
    return dot > 0 ? tag.slice(0, dot) : tag.toLowerCase();
};
