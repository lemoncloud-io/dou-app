import { isEventChat, isNotifiableChat } from './chatPreview';
import type { DomainChat } from './models';

/**
 * The version of the rules below. Raise it whenever `chatNotificationEntries` would answer differently
 * for a row it has already answered for: once the entries are stored beside the rows, a room indexed
 * under an older version is indexed again the next time it is read.
 */
export const CHAT_NOTIFICATION_ENTRIES_VERSION = 1;

/**
 * What a row can tell an inbox, with no viewer in mind:
 * - `mention` — the row names a member (`ref` is the member id);
 * - `everyone` — the row calls everyone (`ref` is empty);
 * - `reply` — the row is a thread reply (`ref` is its `parentId`, the thread root);
 * - `reaction` — the row is a reaction event (`ref` is the chat id it targets).
 */
export type ChatNotificationKind = 'mention' | 'everyone' | 'reply' | 'reaction';

export interface ChatNotificationEntry {
    kind: ChatNotificationKind;
    ref: string;
    chatId: string;
    channelId: string;
    chatNo: number;
    /**
     * The server's sent time (epoch ms). Not the cached `createdAtMs`, which falls back to the device
     * clock when the server sent none, so two devices would order the same entries differently.
     */
    createdAt: number;
    authorId?: string;
    /** A `reaction` entry's emoji. */
    emoji?: string;
    /** A `reaction` entry's toggle. A reaction taken back is an `off` event of its own. */
    action?: 'on' | 'off';
}

/** `all` arrives as a boolean from a read and as the model's `1` from a live `chat.sync`. */
const isEveryone = (all: unknown): boolean => all === true || all === 1;

const authorOf = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId ?? undefined;

/** A row the server has numbered and that still stands: sent, not failed, not deleted. */
const isSettledRow = (chat: DomainChat): boolean =>
    !!chat.id && !!chat.chatNo && chat.chatNo > 0 && !chat.isPending && !chat.isFailed && !chat.hidden;

/**
 * Whether a row is a message someone wrote that an inbox may file: a settled row that is neither
 * server-generated (`stereo: 'system'`) nor an event about another message (a reaction, a revision
 * notice). A 1:1 message needs no entry to be filed, but it has to pass this same test.
 */
export const isNotifiableMessage = (chat: DomainChat): boolean =>
    isSettledRow(chat) && isNotifiableChat(chat) && !isEventChat(chat);

/**
 * A row as its notification entries. This is the one place those facts are read off a row, so the
 * in-memory inbox and an index stored beside the rows cannot disagree about what a row says.
 *
 * Nothing here knows who is reading: the ids a reader is known by differ per cloud and per room, and
 * some are learnt after a row is cached. A reader's own mentions, threads and reactions are picked out
 * of these entries at read time.
 *
 * - A message gets one `mention` entry per distinct named member, one `everyone` entry when it calls
 *   everyone, and a `reply` entry when it is a thread reply — a reply that names someone has both.
 * - A reaction event gets one `reaction` entry, `on` or `off`. Reaction events are system rows; they
 *   are the one kind of system row that has entries.
 * - Unsent, failed and deleted rows, revision notices and other system rows have none.
 */
export const chatNotificationEntries = (chat: DomainChat): ChatNotificationEntry[] => {
    if (!isSettledRow(chat)) return [];
    const base = {
        chatId: chat.id,
        channelId: chat.channelId,
        chatNo: chat.chatNo as number,
        createdAt: chat.createdAt ?? 0,
        authorId: authorOf(chat),
    };

    if (chat.subType === 'reaction') {
        const reaction = chat.reaction$;
        if (!reaction?.chatId || !reaction.emoji) return [];
        return [
            {
                ...base,
                kind: 'reaction',
                ref: reaction.chatId,
                emoji: reaction.emoji,
                action: reaction.action === 'off' ? 'off' : 'on',
            },
        ];
    }
    if (!isNotifiableMessage(chat)) return [];

    const entries: ChatNotificationEntry[] = [];
    const named = Array.from(new Set((chat.mention$?.userIds ?? []).filter(Boolean)));
    for (const userId of named) entries.push({ ...base, kind: 'mention', ref: userId });
    if (isEveryone(chat.mention$?.all)) entries.push({ ...base, kind: 'everyone', ref: '' });
    if (chat.parentId) entries.push({ ...base, kind: 'reply', ref: chat.parentId });
    return entries;
};
