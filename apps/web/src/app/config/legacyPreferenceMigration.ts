import { encodeValue, storageKeyFor } from '@chatic/config';
import { normalizePinnedChannels } from '@chatic/shared';

import {
    normalizeChannelSort,
    normalizeCloudPromoDismissedAt,
    normalizeRecentSearches,
} from '../stores/preferenceParsers';

/**
 * One-time carry-over of `usePreferenceStore`'s pre-`@chatic/config` localStorage keys into the
 * registry's own namespaced storage (`storageKeyFor`), so an existing user's theme, blur setting,
 * onboarding state, channel sort, pins, recent searches, dismissed-update stamp and cloud-promo
 * dismissal all survive the migration instead of silently resetting to `defaultValue` (ADR-0079
 * "레거시 저장값 승계" — flagged as the largest risk in this step).
 *
 * Runs on every boot, not behind a flag: the check IS "does the old key still have something to
 * give" — once a key migrates, its old name is deleted, so the next boot finds nothing there and
 * does nothing. This also closes the one way a flag-based approach could go wrong: leaving the old
 * key alive after migrating would let a later `config.clear()` (which removes the new, namespaced
 * key) make the old value reappear on the next boot as if it had never been cleared.
 *
 * Must run before `config.init()` — the values it writes are read into the `local` lane by
 * `hydrateStorage()`, which only runs once, inside `init()`.
 */
type Decoded = { has: true; value: unknown } | { has: false };

const asBoolean = (raw: string): Decoded => ({ has: true, value: raw === 'true' });
const asString = (raw: string): Decoded => ({ has: true, value: raw });

const asJson =
    (normalize: (value: unknown) => unknown) =>
    (raw: string): Decoded => {
        try {
            return { has: true, value: normalize(JSON.parse(raw)) };
        } catch {
            return { has: false };
        }
    };

/** '' (never dismissed) carries nothing worth migrating — `ui.cloudPromoDismissedAt`'s default is already 0. */
const asCloudPromoDismissedAt = (raw: string): Decoded => {
    const value = normalizeCloudPromoDismissedAt(raw);
    return value > 0 ? { has: true, value } : { has: false };
};

interface LegacyMapping {
    /** The old, pre-`@chatic/config` localStorage key `usePreferenceStore` wrote. */
    oldKey: string;
    /** The registry key it becomes. */
    newKey: string;
    decode: (raw: string) => Decoded;
}

const MAPPINGS: readonly LegacyMapping[] = [
    { oldKey: 'chatic-blur-last-message', newKey: 'ui.blurLastMessage', decode: asBoolean },
    // Both sides already agree on polarity: the old key stores 'true' when onboarding IS completed,
    // same as `ui.onboardingCompleted` — only the retired `usePreferenceStore.isFirstRun` field
    // (never itself persisted) held the inverse.
    { oldKey: 'chatic-onboarding-completed', newKey: 'ui.onboardingCompleted', decode: asBoolean },
    { oldKey: 'chatic-push-muted', newKey: 'ui.pushMuted', decode: asBoolean },
    { oldKey: 'chatic-dismissed-update-version', newKey: 'ui.dismissedUpdateVersion', decode: asString },
    { oldKey: 'chatic-channel-sort', newKey: 'ui.channelSort', decode: asJson(normalizeChannelSort) },
    { oldKey: 'chatic-pinned-channels', newKey: 'ui.pinnedChannels', decode: asJson(normalizePinnedChannels) },
    { oldKey: 'chatic-recent-searches', newKey: 'ui.recentSearches', decode: asJson(normalizeRecentSearches) },
    { oldKey: 'chatic-cloud-promo-dismissed-at', newKey: 'ui.cloudPromoDismissedAt', decode: asCloudPromoDismissedAt },
];

export const migrateLegacyPreferences = (): void => {
    if (typeof window === 'undefined') return;
    for (const { oldKey, newKey, decode } of MAPPINGS) {
        try {
            const oldRaw = localStorage.getItem(oldKey);
            if (oldRaw === null) continue;

            if (localStorage.getItem(storageKeyFor(newKey)) === null) {
                const decoded = decode(oldRaw);
                if (decoded.has) localStorage.setItem(storageKeyFor(newKey), encodeValue(decoded.value));
            }
            // Removed either way once read: a decode failure (`has: false`) is exactly as retryable
            // as a corrupt value ever was under the old store — there is nothing left to recover.
            localStorage.removeItem(oldKey);
        } catch {
            // A blocked or full store leaves the old key in place; the next boot retries.
        }
    }
};

/**
 * `vite-ui-theme` is not private to this app — five apps' `index.html` pre-paint scripts and
 * `@chatic/theme`'s `ThemeProvider` (admin-v2/desktop-web/landing) all read and write this exact
 * key directly, deliberately ("a shared machine keeps one preference" — see
 * `apps/block-kit-builder/index.html`). Unlike the other keys above, this is not a one-time move:
 * it stays the durable source and `ui.theme`'s own namespaced storage is kept as a mirror of it,
 * re-synced on every boot so a theme change made in one of those other apps on the same browser
 * shows up here too. The write-back half of the mirror lives in `useTheme.ts`'s `setTheme`.
 */
export const syncThemeFromSharedKey = (): void => {
    if (typeof window === 'undefined') return;
    try {
        const shared = localStorage.getItem('vite-ui-theme');
        if (shared !== null) localStorage.setItem(storageKeyFor('ui.theme'), encodeValue(shared));
    } catch {
        // Best-effort — the resolver still has window.CHATIC_APP_THEME / defaultValue below it.
    }
};
