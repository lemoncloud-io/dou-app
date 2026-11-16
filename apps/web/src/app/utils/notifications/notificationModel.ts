/**
 * Why an item is in the notification inbox. One message is one item, filed under the strongest
 * reason it has (see `classifyMessage`).
 *
 * - `mention` — a top-level message calls me out (by id, or "everyone").
 * - `threadMention` — a thread reply calls me out.
 * - `replyToMine` — someone replied in a thread whose root is my message.
 * - `participatedThread` — someone replied in a thread I replied in before, whose root is not mine.
 * - `reaction` — someone reacted to a message of mine.
 * - `dmMessage` — a new message in a 1:1 that none of the above covers.
 */
export type NotificationKind =
    | 'mention'
    | 'threadMention'
    | 'replyToMine'
    | 'participatedThread'
    | 'reaction'
    | 'dmMessage';

/**
 * One inbox entry, snapshotted when it was captured. A snapshot rather than a pointer into the chat
 * cache, because the source row pages out of that cache long before the inbox forgets the item.
 */
export interface NotificationItem {
    /** The dedupe key — see {@link notificationId} and {@link reactionNotificationId}. */
    id: string;
    /**
     * The cloud the message belongs to. Every cloud numbers its places and channels from the same
     * start, so a place id or a channel id alone names one in every other cloud too.
     */
    cloudId: string;
    /** The place the room is in. Absent when the room belongs to no single place (a relay 1:1). */
    placeId?: string;
    channelId: string;
    /** The room's name when captured, without `#` — its place's rooms may not be loaded when it is read. */
    channelName?: string;
    /** Set when the room is a 1:1; such a room is named by its person, so it keeps no name. */
    inDm?: true;
    /** The message's number in the room — the read cursor compares against it. */
    chatNo?: number;
    /** The thread root's chatNo when the item lives in a thread; absent for a top-level message. */
    parentId?: string;
    kind: NotificationKind;
    /** The emoji of a `reaction` item. */
    emoji?: string;
    /**
     * A `reaction` item's target: the chatNo of the message reacted to, where opening the item goes.
     * `chatNo` stays the reaction's own number, which is what the read cursor passes.
     */
    targetChatNo?: number;
    ownerId?: string;
    /** The author's name when captured; a screen may resolve a fresher one from `ownerId`. */
    ownerName: string;
    /** The message as one trimmed line — the emoji itself for a `reaction`. */
    content: string;
    /** The original message, one line: the thread root, or the message reacted to. */
    quote?: string;
    /** When the message was sent (epoch ms), not when this device saw it. */
    createdAt: number;
    read: boolean;
}

/** The inbox's tabs, in display order. */
export const NOTIFICATION_TABS = ['all', 'group', 'dm', 'thread', 'mention'] as const;
export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

/** The kinds that call me by name — the `mention` tab, and the orange chip on a row. */
export const MENTION_KINDS: ReadonlySet<NotificationKind> = new Set(['mention', 'threadMention']);

/** The kinds that are replies in a thread I am part of — the `thread` tab, and the blue chip. */
export const THREAD_KINDS: ReadonlySet<NotificationKind> = new Set(['replyToMine', 'participatedThread']);

/**
 * The kinds a "looking for me" list shows: someone calling me, or answering me. A reaction, a plain
 * 1:1 message and a reply in a thread I only joined are left to the full inbox.
 */
export const FIND_ME_KINDS: ReadonlySet<NotificationKind> = new Set(['mention', 'threadMention', 'replyToMine']);

/**
 * The inbox key of a message: its id under its cloud. Message ids are the cloud's own, so two clouds
 * can hand over the same one, and the second would read as already captured and be dropped.
 */
export const notificationId = (cloudId: string, chatId: string): string => `${cloudId}:${chatId}`;

/**
 * The inbox key of a reaction: the message reacted to, the emoji and the person. Not the reaction
 * event's own id, which changes with every toggle — taking a reaction back and giving it again is
 * still one item.
 */
export const reactionNotificationId = (
    cloudId: string,
    targetChatId: string,
    emoji: string,
    authorId: string
): string => `${cloudId}:reaction:${targetChatId}:${emoji}:${authorId}`;

/**
 * How much of a message the inbox keeps. A row shows two lines at most, and the whole inbox is
 * rewritten to device storage on every change, so a long tail the reader never sees is not stored.
 */
export const NOTIFICATION_PREVIEW_CHARS = 240;

export const truncatePreview = (text: string): string =>
    text.length > NOTIFICATION_PREVIEW_CHARS ? text.slice(0, NOTIFICATION_PREVIEW_CHARS) : text;

/**
 * A reply's `parentId` as the root's chatNo. A persisted reply carries the chatNo string; an
 * optimistic one carries the root's full `<channelId>:<chatNo>` id.
 */
export const threadRootNo = (parentId: string): string => parentId.slice(parentId.lastIndexOf(':') + 1);

/** The key of one thread on this device: cloud, room and root. */
export const threadKey = (cloudId: string, channelId: string, rootNo: string): string =>
    `${cloudId}:${channelId}:${rootNo}`;
