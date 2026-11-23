import type { MentionKind } from './mentionMatch';

export type InboxKind = MentionKind | 'dm' | 'reply' | 'reaction';

export const INBOX_TABS = ['all', 'channel', 'dm', 'thread', 'mention'] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export const INBOX_SORTS = ['newest', 'oldest', 'unread'] as const;
export type InboxSort = (typeof INBOX_SORTS)[number];

export const inboxKindOf = (item: { kind?: InboxKind }): InboxKind => item.kind ?? 'direct';

export const isMentionKind = (item: { kind?: InboxKind }): boolean => {
    const kind = inboxKindOf(item);
    return kind === 'direct' || kind === 'everyone';
};

export const inboxKindFor = ({
    isReaction,
    isDm,
    mention,
}: {
    isReaction: boolean;
    isDm: boolean;
    mention: MentionKind | null;
}): InboxKind | null => (isReaction ? 'reaction' : isDm ? 'dm' : mention);

export const inboxPlaceScope = ({
    isDefaultMode,
    selectedPlaceId,
    placeIds,
}: {
    isDefaultMode: boolean;
    selectedPlaceId: string | null | undefined;
    placeIds: readonly (string | undefined)[];
}): ReadonlySet<string> => {
    const ids = isDefaultMode ? placeIds : [selectedPlaceId];
    return new Set(ids.filter((id): id is string => !!id));
};

export const isInInboxScope = (
    item: { cloudId: string; placeId?: string },
    cloudId: string,
    scope: ReadonlySet<string>
): boolean => item.cloudId === cloudId && (!item.placeId || scope.has(item.placeId));
