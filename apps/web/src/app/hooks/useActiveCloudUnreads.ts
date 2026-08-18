import { useActiveCloudData } from './activeCloudDataContext';
import type { ChannelUnreads } from './useChannelUnreads';

/**
 * Unread across every site of the active cloud, not just the one being viewed.
 *
 * A read of the ONE shared observation (`ActiveCloudDataProvider`), not a subscription: three
 * surfaces consume it — `UnreadBadgeRunner` (app-icon `total`), `UnifiedLayout` (bottom-nav
 * `total`) and `HomePage` (`byPlace` place dots, `byChannel` row counts) — and each used to
 * assemble the same number from its own channel observer plus one join observer per channel
 * (ADR-0056). The cache layer shared the storage reads, but not the callbacks, the `Map` rebuilds
 * or the O(channels) aggregation, so every join write paid for all three.
 *
 * `byChannel` is cloud-wide. Home reads its rows out of it by channel id, so the extra keys for
 * other sites are inert — and it no longer needs a second, active-site-only aggregation.
 */
export const useActiveCloudUnreads = (): ChannelUnreads => useActiveCloudData().unreads;
