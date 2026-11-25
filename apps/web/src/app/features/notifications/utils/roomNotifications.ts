import {
    chatNotificationEntries,
    isMentioningViewer,
    isNotifiableMessage,
    type DomainChannel,
    type DomainChat,
} from '@chatic/runtime-react';

import {
    notificationId,
    reactionNotificationId,
    threadRootNo,
    type NotificationItem,
} from '../../../utils/notifications';
import { classifyMessage, type ThreadRelation } from './classify';

export interface RoomNotificationInput {
    cloudId: string;
    placeId?: string;
    channel: DomainChannel;
    rows: readonly DomainChat[];
    viewerIds: readonly string[];
    readCursor: number;
    mentionsOnly: boolean;
    since: number;
    roots: ReadonlyMap<string, DomainChat | null>;
    targets: ReadonlyMap<string, DomainChat | null>;
    preview: (chat: DomainChat) => string;
}

export interface RoomNotificationResult {
    items: NotificationItem[];
    missingRoots: string[];
    missingTargets: string[];
}

const authorOf = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId ?? undefined;

const roomOf = (channel: DomainChannel): Pick<NotificationItem, 'inDm' | 'channelName'> =>
    channel.stereo === 'dm'
        ? { inDm: true }
        : { channelName: (channel.name ?? '').replace(/^#+/, '').trim() || undefined };

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

    const repliedIn = new Map<string, number>();
    for (const row of rows) {
        if (!row.parentId || !isMine(row) || !isNotifiableMessage(row)) continue;
        const rootNo = threadRootNo(row.parentId);
        repliedIn.set(rootNo, Math.max(repliedIn.get(rootNo) ?? 0, row.chatNo ?? 0));
    }
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
