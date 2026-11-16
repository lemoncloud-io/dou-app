import {
    chatNotificationEntries,
    isMentioningViewer,
    isNotifiableMessage,
    type DomainChannel,
    type DomainChat,
} from '@chatic/data';

import {
    notificationId,
    reactionNotificationId,
    threadRootNo,
    type NotificationItem,
} from '../../../utils/notifications';
import { classifyMessage, type ThreadRelation } from './classify';

/** What the inbox knows about one room when it works out the room's items. */
export interface RoomNotificationInput {
    cloudId: string;
    /** The place the room is filed under; absent for a room that belongs to no single place. */
    placeId?: string;
    channel: DomainChannel;
    /** The room's cached rows, newest window, in any order. */
    rows: readonly DomainChat[];
    /** Every id the reader is known by in this room. */
    viewerIds: readonly string[];
    /** The room's read cursor: a top-level item at or below it is read. */
    readCursor: number;
    /** The reader turned the room's notifications off or down to mentions: only mentions are kept. */
    mentionsOnly: boolean;
    /** Messages sent before this (epoch ms) are past the retention window. */
    since: number;
    /**
     * Thread roots read outside the window, by root chat number: the row, or `null` when it could not
     * be read. A root the window holds is taken from `rows`.
     */
    roots: ReadonlyMap<string, DomainChat | null>;
    /** Reaction targets read outside the window, by chat id: the row, or `null` when not cached. */
    targets: ReadonlyMap<string, DomainChat | null>;
    /** A message as one trimmed line, the way the home row prints it. */
    preview: (chat: DomainChat) => string;
}

export interface RoomNotificationResult {
    items: NotificationItem[];
    /** Thread roots to read before the room's thread replies can be told apart, by root chat number. */
    missingRoots: string[];
    /** Reaction targets to look up in the cache, by chat id. */
    missingTargets: string[];
}

const authorOf = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId ?? undefined;

/** Where an item happened: a 1:1 is named by its person, so it keeps no room name. */
const roomOf = (channel: DomainChannel): Pick<NotificationItem, 'inDm' | 'channelName'> =>
    channel.stereo === 'dm'
        ? { inDm: true }
        : { channelName: (channel.name ?? '').replace(/^#+/, '').trim() || undefined };

/**
 * One room's inbox items, worked out from its cached rows. Pure: the rows, the reader and what has
 * already been read outside the window go in, the items and what still needs reading come out.
 *
 * A message someone else wrote is filed once, under the strongest reason it has (`classifyMessage`):
 * a mention of the reader, a reply in a thread whose root is theirs, a reply in a thread they replied
 * in, a new 1:1 message. Whether it calls the reader is read from its mention record
 * (`isMentioningViewer`), the rule home's `@me` mark uses; its thread from the row's entries.
 *
 * - **Threads** are worked out from the rows. A reply the reader wrote makes its thread one they take
 *   part in; a thread's root is taken from the window, else from `roots`. A reply whose root is not
 *   known yet is filed as far as the window tells (a thread the reader replied in, or nothing) and its
 *   root is asked for; it is filed again once the root arrives.
 * - **Reactions** are folded per target, emoji and person, the newest event winning, so a reaction
 *   taken back leaves nothing. Only a reaction to the reader's own message is kept; a target outside
 *   the window is asked for from the cache, never from the server.
 * - **Read**: a top-level item is read at or below the room's cursor. An item in a thread is not read
 *   by the room's cursor — a thread is read on its own screen, which the overlay records — but it is
 *   read when the reader has replied after it in the same thread.
 *
 * Left out: the reader's own rows, rows sent before `since`, anything that is not a settled message or
 * reaction, and in a room down to mentions, everything but mentions.
 */
export const roomNotifications = (input: RoomNotificationInput): RoomNotificationResult => {
    const { cloudId, placeId, channel, rows, viewerIds, readCursor, mentionsOnly, since, roots, targets, preview } =
        input;
    const isMine = (chat: DomainChat): boolean => {
        const author = authorOf(chat);
        return chat.stereo !== 'webhook' && !!author && viewerIds.includes(author);
    };
    const room = roomOf(channel);
    const byNo = new Map<string, DomainChat>();
    const byId = new Map<string, DomainChat>();
    for (const row of rows) {
        if (row.chatNo) byNo.set(String(row.chatNo), row);
        if (row.id) byId.set(row.id, row);
    }

    // Threads the reader replied in, as far as the window shows, with their latest reply there: whatever
    // came before a reply of theirs in the same thread they have seen.
    const repliedIn = new Map<string, number>();
    for (const row of rows) {
        if (!row.parentId || !isMine(row) || !isNotifiableMessage(row)) continue;
        const rootNo = threadRootNo(row.parentId);
        repliedIn.set(rootNo, Math.max(repliedIn.get(rootNo) ?? 0, row.chatNo ?? 0));
    }
    // A top-level item is read once the room's cursor passes it; one in a thread once the reader has
    // replied after it there. The overlay adds a thread read on its screen.
    const isRead = (chatNo: number | undefined, rootNo: string | undefined): boolean =>
        (chatNo ?? 0) <= (rootNo ? (repliedIn.get(rootNo) ?? 0) : readCursor);

    const items: NotificationItem[] = [];
    const missingRoots = new Set<string>();
    const missingTargets = new Set<string>();
    const rootOf = (rootNo: string): DomainChat | null | undefined => byNo.get(rootNo) ?? roots.get(rootNo);

    for (const row of rows) {
        if (!isNotifiableMessage(row) || isMine(row) || (row.createdAt ?? 0) < since) continue;
        const reply = chatNotificationEntries(row).find(entry => entry.kind === 'reply');
        const rootNo = reply ? threadRootNo(reply.ref) : undefined;
        const mentionsMe = isMentioningViewer(row, viewerIds);

        let relation: ThreadRelation = 'none';
        let root: DomainChat | null | undefined;
        if (rootNo && !mentionsMe && !mentionsOnly) {
            root = rootOf(rootNo);
            if (root === undefined) missingRoots.add(rootNo);
            if (root && isMine(root)) relation = 'rootMine';
            else if (repliedIn.has(rootNo)) relation = 'participated';
        }
        const kind = classifyMessage({
            isThreadReply: !!rootNo,
            mentionsMe,
            isDm: channel.stereo === 'dm',
            thread: relation,
            mentionsOnly,
        });
        if (!kind) continue;
        const content = preview(row);
        if (!content) continue;
        items.push({
            id: notificationId(cloudId, row.id),
            cloudId,
            placeId,
            channelId: channel.id,
            ...room,
            chatNo: row.chatNo,
            parentId: rootNo,
            kind,
            ownerId: authorOf(row),
            ownerName: row.owner$?.name ?? '',
            content,
            quote: (kind === 'replyToMine' || kind === 'participatedThread') && root ? preview(root) : undefined,
            createdAt: row.createdAt ?? 0,
            read: isRead(row.chatNo, rootNo),
        });
    }

    if (!mentionsOnly) {
        // The newest event per target, emoji and person decides whether a reaction stands.
        const newest = new Map<string, { row: DomainChat; target: string; emoji: string; on: boolean }>();
        for (const row of rows) {
            const entry = chatNotificationEntries(row).find(candidate => candidate.kind === 'reaction');
            if (!entry?.emoji || !entry.authorId) continue;
            const key = `${entry.ref}\u0000${entry.emoji}\u0000${entry.authorId}`;
            const held = newest.get(key);
            if (held && (held.row.chatNo ?? 0) > (row.chatNo ?? 0)) continue;
            newest.set(key, { row, target: entry.ref, emoji: entry.emoji, on: entry.action === 'on' });
        }
        for (const { row, target: targetId, emoji, on } of newest.values()) {
            if (!on || isMine(row) || (row.createdAt ?? 0) < since) continue;
            const target = byId.get(targetId) ?? targets.get(targetId);
            if (target === undefined) {
                missingTargets.add(targetId);
                continue;
            }
            if (!target || !isMine(target)) continue;
            const targetRoot = target.parentId ? threadRootNo(target.parentId) : undefined;
            const authorId = authorOf(row) as string;
            items.push({
                id: reactionNotificationId(cloudId, targetId, emoji, authorId),
                cloudId,
                placeId,
                channelId: channel.id,
                ...room,
                chatNo: row.chatNo,
                targetChatNo: target.chatNo,
                parentId: targetRoot,
                kind: 'reaction',
                emoji,
                ownerId: authorId,
                ownerName: row.owner$?.name ?? '',
                content: emoji,
                quote: preview(target),
                createdAt: row.createdAt ?? 0,
                read: isRead(row.chatNo, targetRoot),
            });
        }
    }

    return { items, missingRoots: [...missingRoots], missingTargets: [...missingTargets] };
};
