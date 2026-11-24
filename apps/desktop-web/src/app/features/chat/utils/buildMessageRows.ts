import type { DomainChat } from '@chatic/runtime';

import {
    isOwnChat,
    isPlaceholderName,
    isViewerId,
    isWebhookChat,
    resolveDisplay,
    type MessageViewer,
} from '../../../shared/utils';

export { isViewerId };
export type { MessageViewer };

export interface MessageGroup {
    key: string;
    ownerId: string | undefined;
    ownerName: string;
    namePending: boolean;
    isWebhook: boolean;
    avatar: string | undefined;
    isMine: boolean;
    colorSeed: string;
    timestamp: number;
    messages: DomainChat[];
}

export type MessageRowItem =
    | { kind: 'date'; key: string; timestamp: number }
    | { kind: 'unread'; key: string }
    | { kind: 'replies'; key: string; count: number }
    | {
          kind: 'system';
          key: string;
          chat: DomainChat;
          authorName: string;
          joinedNames?: string[];
      }
    | { kind: 'group'; group: MessageGroup };

const MINUTE_MS = 60 * 1000;
const minuteOf = (ms: number): number => Math.floor(ms / MINUTE_MS);

const realName = (name?: string): string | undefined => (isPlaceholderName(name) ? undefined : name?.trim());

export const isOwnMessage = isOwnChat;

const resolveOwnerName = (
    chat: DomainChat,
    viewer: MessageViewer,
    names?: ReadonlyMap<string, string>
): string | null => {
    if (isOwnMessage(chat, viewer)) {
        const fromCloud = viewer.cloudUid ? realName(names?.get(viewer.cloudUid)) : undefined;
        return realName(viewer.name) || fromCloud || realName(chat.owner$?.name) || 'You';
    }
    const fromOwner = realName(chat.owner$?.name);
    const fromMembers = chat.ownerId ? realName(names?.get(chat.ownerId)) : undefined;
    return fromOwner || fromMembers || null;
};

const WEBHOOK_FALLBACK_NAME = 'Webhook';

const webhookName = (chat: DomainChat): string => realName(chat.owner$?.name) || WEBHOOK_FALLBACK_NAME;

export const getTimestamp = (chat: DomainChat): number => chat.createdAt ?? chat.createdAtMs ?? 0;

export const messageKeyOf = (chat: DomainChat): string => String(chat.id ?? chat.tempId ?? chat.chatNo);

const isSameDay = (a: number, b: number): boolean => {
    if (!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
};

export const startOfDay = (ms: number): number => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

export const buildMessageRows = (
    messages: DomainChat[],
    viewer: MessageViewer,
    names?: ReadonlyMap<string, string>,
    baselineReadNo = 0,
    membersLoading = false,
    placeProfiles: Record<string, { nick?: string; thumbnail?: string }> = {},
    threadReplyCount?: number,
    now?: number
): MessageRowItem[] => {
    const rows: MessageRowItem[] = [];
    let currentGroup: MessageGroup | null = null;
    let lastTimestamp = 0;
    let unreadInserted = false;
    let repliesInserted = false;

    const flush = () => {
        if (currentGroup) rows.push({ kind: 'group', group: currentGroup });
        currentGroup = null;
    };

    for (const message of messages) {
        const timestamp = getTimestamp(message);

        const isThread = threadReplyCount !== undefined;

        if (isThread && !repliesInserted && message.parentId) {
            flush();
            rows.push({ kind: 'replies', key: 'thread-replies', count: threadReplyCount });
            repliesInserted = true;
        }

        if (!isThread && !isSameDay(timestamp, lastTimestamp)) {
            flush();
            const dayMs = startOfDay(timestamp);
            rows.push({
                kind: 'date',
                key: `date:${dayMs}:${message.id ?? message.tempId ?? message.chatNo}`,
                timestamp: dayMs,
            });
        }

        if (message.stereo === 'system') {
            flush();
            const authorName = resolveOwnerName(message, viewer, names) ?? '';
            const previous = rows[rows.length - 1];
            if (
                previous?.kind === 'system' &&
                previous.chat.subType === 'join' &&
                message.subType === 'join' &&
                previous.authorName &&
                authorName
            ) {
                previous.joinedNames = [...(previous.joinedNames ?? [previous.authorName]), authorName];
                lastTimestamp = timestamp;
                continue;
            }
            rows.push({
                kind: 'system',
                key: message.id ?? message.tempId ?? `system:${message.channelId}:${message.chatNo}`,
                chat: message,
                authorName,
            });
            lastTimestamp = timestamp;
            continue;
        }

        const isUnread = (message.chatNo ?? 0) > baselineReadNo && !isOwnMessage(message, viewer);
        if (!unreadInserted && baselineReadNo > 0 && isUnread) {
            flush();
            rows.push({ kind: 'unread', key: `unread:${message.chatNo}` });
            unreadInserted = true;
        }

        const isWebhook = isWebhookChat(message);
        const open = currentGroup as MessageGroup | null;
        const sameAuthor =
            open?.ownerId === message.ownerId &&
            open?.isWebhook === isWebhook &&
            (!isWebhook || open?.ownerName === webhookName(message));

        if (open && sameAuthor && minuteOf(timestamp) === minuteOf(open.timestamp)) {
            open.messages.push(message);
        } else {
            flush();
            const resolvedName = isWebhook ? webhookName(message) : resolveOwnerName(message, viewer, names);
            const isMine = isOwnMessage(message, viewer);
            const place = isWebhook
                ? undefined
                : isMine
                  ? ((viewer.cloudUid ? placeProfiles[viewer.cloudUid] : undefined) ??
                    (viewer.uid ? placeProfiles[viewer.uid] : undefined) ??
                    (message.ownerId ? placeProfiles[message.ownerId] : undefined))
                  : message.ownerId
                    ? placeProfiles[message.ownerId]
                    : undefined;
            const placeNick = place?.nick?.trim();
            const display = resolveDisplay(
                place,
                resolvedName ?? '',
                message.owner$?.thumbnail ?? (isMine ? viewer.photo : undefined)
            );
            currentGroup = {
                key: message.id ?? message.tempId ?? `${message.channelId}:${message.chatNo}`,
                ownerId: message.ownerId,
                ownerName: display.name || (isWebhook ? WEBHOOK_FALLBACK_NAME : 'Unknown'),
                namePending: !placeNick && resolvedName === null && membersLoading,
                isWebhook,
                avatar: display.thumbnail,
                isMine,
                colorSeed: isMine
                    ? viewer.cloudUid || viewer.uid || message.ownerId || '?'
                    : message.ownerId || resolvedName || '?',
                timestamp,
                messages: [message],
            };
        }

        lastTimestamp = timestamp;
    }

    flush();
    if (now !== undefined && threadReplyCount === undefined && lastTimestamp && !isSameDay(lastTimestamp, now)) {
        const dayMs = startOfDay(now);
        rows.push({ kind: 'date', key: `date:${dayMs}:today`, timestamp: dayMs });
    }
    return rows;
};
