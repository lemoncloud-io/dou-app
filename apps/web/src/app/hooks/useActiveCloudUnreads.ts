import { useActiveCloudChannels } from './useActiveCloudChannels';
import { useChannelUnreads, type ChannelUnreads } from './useChannelUnreads';
import { useMyJoins } from './useMyJoins';

/**
 * Unread across every site of the active cloud, not just the one being viewed.
 *
 * Cache-only (`sync: false`): mounting this registers zero per-channel join sync — freshness rides
 * {@link useActiveCloudChannels}'s cloud-wide `syncChannels` delta (via `useBackgroundSync`) plus
 * each channel's live join cache, which still reflects my own reads immediately (optimistic write).
 *
 * One shared subscription for two consumers (ADR-0056): `UnreadBadgeRunner` (app-icon `total`) and
 * `HomePage` (`byPlace`, so every place — not just the active one — can show a dot). HomePage's
 * per-channel counts for the active site keep their own `useChannelUnreads(channels, useMyJoins(channels))`
 * call instead (join sync `true`) — that registration is intentionally scoped to the active site's
 * channels alone, so it tears down when home unmounts rather than living for the app's lifetime.
 */
export const useActiveCloudUnreads = (): ChannelUnreads => {
    const cloudChannels = useActiveCloudChannels();
    return useChannelUnreads(cloudChannels, useMyJoins(cloudChannels, { sync: false }));
};
