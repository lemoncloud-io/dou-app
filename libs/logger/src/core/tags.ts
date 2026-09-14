/**
 * The tags the trigger catalog defines, grouped as it groups them.
 *
 * **Mirrors the catalog, and is not itself the source of truth.** The canonical list lives in the
 * knowledge vault (`projects/@lemoncloud-io/dou-app/log-collection/triggers.md`); this constant
 * exists so a call site can be checked against it without a human remembering the table. When the
 * table changes, this follows — never the other way round.
 *
 * Known gaps, deliberately NOT added here: `SESSION` and `WEB_CORE` are used by the shared
 * libraries, and `GLOBAL_LOADER`, `SETUP`, `TOKEN_GENERATOR` are one-offs — none of them appear in
 * the catalog yet. Adding them here would make this a second, diverging source of truth; they are
 * recorded as a gap for the next catalog pass instead. `ERROR_REPORT`/`ISSUE_REPORT` are historical
 * (the automatic error report was retired in ADR-0073) and `TEST`-shaped tags are fixtures. All of
 * them still compile — see {@link LogTag}.
 */
export const KNOWN_LOG_TAGS = [
    // Global · runtime
    'GLOBAL',
    'APP',
    'ROUTER',
    'PERF',
    'WEB_VITALS',
    'I18N',
    // Transport
    'NET',
    'SOCKET',
    'SYNC',
    'BRIDGE',
    // Web domains
    'AUTH',
    'ACCOUNT',
    'CHAT',
    'CHANNEL',
    'CLOUD',
    'PLACE',
    'PROFILE',
    'INVITE',
    'SEARCH',
    'IAP',
    'FEEDBACK',
    // Storage
    'CACHE',
    'STORAGE',
    'SQLITE',
    'PREFERENCE',
    'LOG_BUFFER',
    // Native capabilities
    'WEBVIEW',
    'NOTIFICATION',
    'PUSH_EVENT',
    'DEEPLINK',
    'UPLOAD',
    'FILE',
    'DEVICE',
    'PERMISSION',
    'CLIPBOARD',
    'SMS',
    'OAUTH',
    'APP_ICON',
    'VERSION',
    'FIREBASE',
    'UNFURL',
] as const;

/** A tag the catalog names. */
export type KnownLogTag = (typeof KNOWN_LOG_TAGS)[number];

/**
 * An entry's tag: any catalog tag, or any other string.
 *
 * **The open half is load-bearing, not laziness.** ADR-0047 deliberately replaced a closed union
 * with a plain `string`, for two reasons that still hold: a native shell older than the web bundle
 * can send a tag this build has never heard of and it must survive the bridge unrewritten, and the
 * server does not validate the value either. Closing the union would reverse that decision.
 *
 * What was missing was the other half. With a bare `string` a typo is accepted in silence by every
 * layer — which is how `PUSH` (a tag the catalog does not have) and a cloud tag split between
 * `CLOUD` and `APP` both survived in the codebase until someone diffed the catalog by hand. The
 * literal union gives autocomplete and makes a misspelling visible, while `string & {}` keeps every
 * existing and future value legal. (`string & {}` rather than plain `string`: it prevents the
 * literals from being widened away, so the editor still suggests them.)
 */
export type LogTag = KnownLogTag | (string & {});

/** Whether `tag` is one the catalog names. For diagnostics and tests — never a runtime gate. */
export const isKnownLogTag = (tag: string): tag is KnownLogTag => (KNOWN_LOG_TAGS as readonly string[]).includes(tag);
