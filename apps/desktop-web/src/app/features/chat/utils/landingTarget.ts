import type { DomainChannel } from '@chatic/data';

/**
 * Which channel the home screen selects when its channel list changes.
 *
 * - `pending`: a deferred open (notification click, saved-item jump, a room just created or
 *   started) whose channel the list now carries.
 * - `fallback`: nothing pending has landed and the selection is gone from the list — restore the
 *   channel last opened in this cloud and place, else the first unread one, else the first.
 * - `null`: leave the selection alone. A pending target that is not listed yet is also `null` while
 *   the current selection is still valid, so waiting for a new room never snaps to another one.
 */
export type Landing = { kind: 'pending' | 'fallback'; channelId: string } | null;

export const landingTarget = (
    channels: readonly Pick<DomainChannel, 'id' | 'unreadCount'>[],
    state: { pendingChannelId: string | null; selectedChannelId: string | null; rememberedChannelId?: string }
): Landing => {
    const isListed = (id: string) => channels.some(channel => channel.id === id);
    const { pendingChannelId, selectedChannelId, rememberedChannelId } = state;
    if (pendingChannelId && isListed(pendingChannelId)) return { kind: 'pending', channelId: pendingChannelId };
    if (selectedChannelId && isListed(selectedChannelId)) return null;
    // A place badged "1" used to open on whatever was first (or last read), which was routinely a
    // channel with nothing new — the badge led nowhere. With no remembered channel, land on the
    // first unread one and the badge resolves to the thing it was pointing at.
    const firstUnread = channels.find(channel => (channel.unreadCount ?? 0) > 0)?.id;
    const target =
        rememberedChannelId && isListed(rememberedChannelId) ? rememberedChannelId : (firstUnread ?? channels[0]?.id);
    return target ? { kind: 'fallback', channelId: target } : null;
};
