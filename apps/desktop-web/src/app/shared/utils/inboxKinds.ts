import type { MentionKind } from './mentionMatch';

/**
 * Why an item is in the inbox. `direct` and `everyone` are mentions; `dm` is a new message in a 1:1,
 * `reply` a reply in a thread of mine, and `reaction` a reaction to a message of mine.
 */
export type InboxKind = MentionKind | 'dm' | 'reply' | 'reaction';

/** The Notifications panel's tabs, in display order. */
export const INBOX_TABS = ['all', 'channel', 'dm', 'thread', 'mention'] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

/** The Notifications panel's sort orders, in display order. */
export const INBOX_SORTS = ['newest', 'oldest', 'unread'] as const;
export type InboxSort = (typeof INBOX_SORTS)[number];

/** An item stored before the inbox took other sources has no kind, and every one of those was a mention. */
export const inboxKindOf = (item: { kind?: InboxKind }): InboxKind => item.kind ?? 'direct';

/**
 * Whether an item is a mention. The `@` on a channel row, the mentions-only place badges and the
 * unread mention count read only these; a DM, a reply or a reaction does not call the reader.
 */
export const isMentionKind = (item: { kind?: InboxKind }): boolean => {
    const kind = inboxKindOf(item);
    return kind === 'direct' || kind === 'everyone';
};

/**
 * The kind a message gets when it is captured as it arrives. One message is one item, so the
 * strongest reason wins: a reaction, then a 1:1, then a mention. A reply is decided later — it needs
 * the thread's root — and only for a message that got no kind here.
 */
export const inboxKindFor = ({
    isReaction,
    isDm,
    mention,
}: {
    isReaction: boolean;
    isDm: boolean;
    mention: MentionKind | null;
}): InboxKind | null => (isReaction ? 'reaction' : isDm ? 'dm' : mention);

/**
 * The places whose items the Notifications destination shows — like Channels and DM, it is about the
 * active place. A cloud's place is one id. The Default Cloud scopes its UI by a `'default'` sentinel
 * no item carries, while its items are captured under the ids `usePlaces` lists, so there the scope
 * is all of those.
 */
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

/**
 * Whether an item belongs to the scope. One stored before items carried a place cannot say where it
 * happened, so it shows in every place rather than in none.
 */
export const isInInboxScope = (item: { placeId?: string }, scope: ReadonlySet<string>): boolean =>
    !item.placeId || scope.has(item.placeId);
