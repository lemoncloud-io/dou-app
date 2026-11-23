import type { DomainChannel } from '@chatic/runtime';

export type Landing = { kind: 'pending' | 'fallback'; channelId: string } | null;

export const landingTarget = (
    channels: readonly Pick<DomainChannel, 'id' | 'unreadCount'>[],
    state: {
        pendingChannelId: string | null;
        selectedChannelId: string | null;
        rememberedChannelId?: string;
        placeSettled?: boolean;
    }
): Landing => {
    const isListed = (id: string) => channels.some(channel => channel.id === id);
    const { pendingChannelId, selectedChannelId, rememberedChannelId, placeSettled = true } = state;
    if (pendingChannelId && !placeSettled) return null;
    if (pendingChannelId && isListed(pendingChannelId)) return { kind: 'pending', channelId: pendingChannelId };
    if (selectedChannelId && isListed(selectedChannelId)) return null;
    const firstUnread = channels.find(channel => (channel.unreadCount ?? 0) > 0)?.id;
    const target =
        rememberedChannelId && isListed(rememberedChannelId) ? rememberedChannelId : (firstUnread ?? channels[0]?.id);
    return target ? { kind: 'fallback', channelId: target } : null;
};

export const openLandingOf = ({
    rootId,
    chatNo,
}: {
    rootId?: string;
    chatNo?: number;
}): { kind: 'thread'; rootId: string } | { kind: 'message'; chatNo: number } | { kind: 'latest' } => {
    if (rootId) return { kind: 'thread', rootId };
    if (chatNo != null) return { kind: 'message', chatNo };
    return { kind: 'latest' };
};

export const opensIntoKnownCloud = (
    target: { cloudId?: string; chatNo?: number },
    { activeCloudId, knownCloudIds }: { activeCloudId: string; knownCloudIds: ReadonlySet<string> }
): boolean => {
    if (target.chatNo == null) return true;
    if (!target.cloudId || target.cloudId === activeCloudId) return true;
    return knownCloudIds.has(target.cloudId);
};
