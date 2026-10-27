import { useCallback } from 'react';

import { config } from '@chatic/config';
import { runtime } from '@chatic/app-runtime';
import type { ICloudRepository } from '@chatic/data';

/** Account/cloud-scoped persist keys — matches each store's persist `name` (single source of truth). */
const ACCOUNT_SCOPED_STORAGE_KEYS = [
    'chatic-my-cloud-uid',
    'chatic-cloud-push-badges',
    'chatic-notification-prefs',
    'chatic-saved-items',
    // Legacy favorites key — migrateLegacyFavorites moves it when a place is opened. To stop an id
    // left over from before migration from leaking into the next account, it must also be cleared on
    // logout (the new record is handled by config.clear below).
    'chatic-favorite-channels',
    'chatic-mentions',
    'chatic-my-threads',
    'chatic-site-profile-cursor',
    'chatic-selected-channel',
    'chatic-known-channels',
    'chatic-last-channel',
    // What the app says after a Google sign-in, left for the reload. Not yet said when the person logs
    // out, it would greet the next account with the previous one's news.
    'chatic-signin-notice',
] as const;

/** The cloud cache minus its invited rows — those carry the endpoints a later switch needs. */
const clearAllButInvitedClouds = async (cloud: ICloudRepository): Promise<void> => {
    const rows = (await cloud.cacheReadList())?.list ?? [];
    await Promise.all(
        rows.filter(row => row.id && row.cloudType !== 'invited').map(row => cloud.cacheDelete(row.id as string))
    );
};

/**
 * Returns a reset callback that clears the previous account's leftover cloud/data on logout.
 *
 * Logout is a full reload (window.location.replace), so in-memory state disappears, but persisted
 * localStorage stores survive, so the account-scoped ones are removed here. `chatic-joined-clouds` is
 * not one of them (below).
 *
 * The v2 engine has no global logout-callback registration point (`registerLogoutCallback` was
 * removed). As with apps/web's `useClearCache`, the logout flow must call this `resetAccount`
 * directly *before* tearing down the session (e.g. `resetAccount().finally(logout)`). At that point
 * the repository scope (cid/uid) still points at the previous user, so only that user's cache gets
 * cleared precisely.
 *
 * Preserved: isInvited / delegatorId (guest identity) / UI settings (panel width, debug). Wiping
 * localStorage wholesale would break those preserved values, so keys are removed explicitly instead.
 *
 * No logout takes the invited clouds. Invite grants belong to the device's guest, and every logout
 * comes back to that guest: a signed-in account on desktop is the guest linked to a provider, and a
 * guest that logs out is registered back into by the same device id — the next sign-in, or "Start
 * chatting", or even a sign-in the person backs out of. The guest still holds every grant and
 * messages from those clouds keep arriving. The rail lists invited clouds only from the cloud
 * cache's invited rows and the joined-clouds store (the relay catalog never carries them, and no
 * server list exists to rebuild them), so wiping both left the list empty until a push re-cached
 * one cloud at a time. apps/web never clears them on logout either.
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
        // The rail order names this account's clouds and places.
        config.clear('ui.railOrder', { lane: 'local' });
        // Channel and chat caches are uid-isolated, so clearing them is hygiene. The cloud cache is
        // not: it is one global partition shared by every account on this profile, so this clear is
        // what keeps one account's cloud names from showing for the next — less the invited rows the
        // device's guest still holds grants for (see the hook doc). Best-effort: the rejection
        // is swallowed so a failure doesn't block logout. (Old `clearAll()` → v2 `cacheClear()`; the 7
        // repos mapped site→place, inviteCloud→cloud.)
        await Promise.all([
            repos.channel.cacheClear(),
            repos.chat.cacheClear(),
            clearAllButInvitedClouds(repos.cloud),
            repos.join.cacheClear(),
            repos.profile.cacheClear(),
            repos.place.cacheClear(),
            repos.user.cacheClear(),
        ]).catch(() => undefined);
    }, [repos]);

    return { resetAccount };
};
