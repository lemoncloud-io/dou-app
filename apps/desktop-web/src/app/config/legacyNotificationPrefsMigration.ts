import { encodeValue, storageKeyFor } from '@chatic/config';

/**
 * One-time carry-over of this app's `pushMuted` preference into `@chatic/config`'s own namespaced
 * storage, so a user who had muted push does not silently come back as un-muted after the switch
 * to `ui.pushMuted` (ADR-0079 "레거시 저장값 승계", the same risk `apps/web` closes in
 * `legacyPreferenceMigration.ts`).
 *
 * It matters more here than a display glitch suggests: `useDevicePushMute` has no read endpoint to
 * reconcile against, so the mirror is only ever corrected by our own next write. A reset mirror
 * would keep telling the user "push is on" while pushes-api still holds the mute, until they
 * toggled the switch twice.
 *
 * Shape differs from `apps/web`'s flat legacy keys: the old value lived INSIDE
 * `useNotificationPrefsStore`'s zustand-persist blob (`{ state, version }` under
 * `chatic-notification-prefs`), which still holds live settings this app keeps there
 * (`desktopEnabled`, `mutedChannels`, `channelNotify`, `snoozeUntil`, `quietHours`). So this strips
 * the one field and writes the blob back rather than removing the key.
 *
 * Stripping it is also what makes the migration self-terminating AND stops it coming back: zustand's
 * persist merges unknown persisted fields into the store on hydration, so a `pushMuted` left in the
 * blob would be re-persisted on the store's next write and out-live the field it belongs to.
 *
 * Must run before `config.init()` — the value it writes is read into the `local` lane by
 * `hydrateStorage()`, which only runs once, inside `init()`.
 */
const LEGACY_KEY = 'chatic-notification-prefs';

export const migrateLegacyPushMuted = (): void => {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (raw === null) return;

        const blob = JSON.parse(raw) as { state?: Record<string, unknown> };
        const state = blob?.state;
        if (!state || !('pushMuted' in state)) return;

        const muted = state.pushMuted;
        // Only a real boolean carries anything; anything else is as unrecoverable as it was before.
        if (typeof muted === 'boolean' && localStorage.getItem(storageKeyFor('ui.pushMuted')) === null) {
            localStorage.setItem(storageKeyFor('ui.pushMuted'), encodeValue(muted));
        }

        delete state.pushMuted;
        localStorage.setItem(LEGACY_KEY, JSON.stringify(blob));
    } catch {
        // Unparseable or a blocked/full store: leave the blob untouched and let the next boot retry.
        // The store's own persist layer already tolerates a corrupt blob by falling back to defaults.
    }
};
