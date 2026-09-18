import { useCallback } from 'react';

import { config } from '@chatic/config';
import { runtime } from '@chatic/app-runtime';

/** Account/cloud-scoped persist keys — matches each store's persist `name` (single source of truth). */
const ACCOUNT_SCOPED_STORAGE_KEYS = [
    'chatic-joined-clouds',
    'chatic-my-cloud-uid',
    'chatic-cloud-push-badges',
    'chatic-notification-prefs',
    'chatic-saved-items',
    // Legacy favorites key — migrateLegacyFavorites moves it when a place is opened. To stop an id
    // left over from before migration from leaking into the next account, it must also be cleared on
    // logout (the new record is handled by config.clear below).
    'chatic-favorite-channels',
    'chatic-mentions',
    'chatic-site-profile-cursor',
    'chatic-selected-channel',
    'chatic-known-channels',
    'chatic-last-channel',
] as const;

/**
 * Returns a reset callback that clears the previous account's leftover cloud/data on logout.
 *
 * Logout is a full reload (window.location.replace), so in-memory state disappears, but persisted
 * localStorage stores survive — in particular `chatic-joined-clouds` keeps exposing the previous
 * account's clouds in CloudRail (useClouds merges it in).
 *
 * The v2 engine has no global logout-callback registration point (`registerLogoutCallback` was
 * removed). As with apps/web's `useClearCache`, the logout flow must call this `resetAccount`
 * directly *before* tearing down the session (e.g. `resetAccount().finally(logout)`). At that point
 * the repository scope (cid/uid) still points at the previous user, so only that user's cache gets
 * cleared precisely.
 *
 * Preserved: isInvited / delegatorId (guest identity) / UI settings (panel width, debug). Wiping
 * localStorage wholesale would break those preserved values, so keys are removed explicitly instead.
 */
export const useAccountResetOnLogout = () => {
    const repos = runtime.data.useRuntimeRepositories();

    const resetAccount = useCallback(async (): Promise<void> => {
        ACCOUNT_SCOPED_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
        // Favorites/ordering now live as @chatic/config records — config.clear sweeps both the lane
        // entry (in-memory) and the persisted `@chatic/config.ui.*` key together. removeItem alone
        // would leave the in-memory value alive right up until the reload.
        config.clear('ui.pinnedChannels', { lane: 'local' });
        config.clear('ui.channelOrder', { lane: 'local' });
        // IndexedDB is uid-isolated, so this is just hygiene — best-effort. The rejection is
        // swallowed so a failure doesn't block logout. (Old `clearAll()` → v2 `cacheClear()`; the 7
        // repos mapped site→place, inviteCloud→cloud.)
        await Promise.all([
            repos.channel.cacheClear(),
            repos.chat.cacheClear(),
            repos.cloud.cacheClear(),
            repos.join.cacheClear(),
            repos.profile.cacheClear(),
            repos.place.cacheClear(),
            repos.user.cacheClear(),
        ]).catch(() => undefined);
    }, [repos]);

    return { resetAccount };
};
