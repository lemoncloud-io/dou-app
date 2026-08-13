import type { CacheType } from '@chatic/app-messages';
import { isNativeCacheTypeUsable } from './nativeCacheSupport';

/**
 * Which physical store a cache type lands in.
 * - `web`: the WebView/browser's own IndexedDB.
 * - `native`: the app shell's SQLite, reached over the bridge.
 */
export type CacheBackend = 'web' | 'native';

export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};

// Types pinned to web storage even inside the native WebView, each listed with the reason it
// cannot live on native storage — an entry leaves this table when its reason ships a fix.
//
// Empty today. `profile` sat here while the native writer stamped the scope `uid` over the profile
// OWNER's `uid`, which collapsed every member of a place onto one `sid@myUid` key so a list read
// returned a single profile and everyone else lost their nick/photo. `ProfileDataSource.serialize`
// now stores the item verbatim (3682ca78) and that app release is out, so profile goes to native
// storage with every other type — which is also the durable one, immune to WebView IndexedDB
// eviction.
//
// Adding an entry here is a stopgap, not a home: it trades native durability for web storage the OS
// can clear, so it only holds for data the server can re-derive.
const WEB_PINNED_CACHE_TYPES: ReadonlySet<CacheType> = new Set<CacheType>();

/**
 * THE routing decision: answers "where is this cache type stored" in one place, so the factory
 * (`localFactory.getCacheStorage`) stays a pure assembler. Checks, in order:
 *
 * 1. No native shell (plain browser, desktop-web) → `web`; there is no other store to reach.
 * 2. Type pinned to web (`WEB_PINNED_CACHE_TYPES`, reasons above) → `web`.
 * 3. The installed shell cannot be trusted to store the type → `web`. The web deploys ahead of
 *    the app, so a type newer than the installed app would otherwise be written into a native
 *    `default:` arm that answers `null` with `success: true` — a permanently empty cache that
 *    looks like a cold miss forever (see nativeCacheSupport for how the shell reports this).
 * 4. Otherwise → `native`: a single durable store that survives WebView IndexedDB eviction.
 */
export const resolveCacheBackend = (type: CacheType): CacheBackend => {
    if (!isNativeApp()) return 'web';
    if (WEB_PINNED_CACHE_TYPES.has(type)) return 'web';
    if (!isNativeCacheTypeUsable(type)) return 'web';
    return 'native';
};
