import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { haptics } from '../../../bridge/haptics';
import { useSelectedCloudId } from '../../../hooks/useCloudScope';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { notificationRoomKey, useNotificationStore } from '../../../stores/useNotificationStore';
import { MENTION_KINDS, threadRootNo, type NotificationItem } from '../../../utils/notifications';
import type { ClientChatView } from '../types';

interface MentionTarget {
    chatNo: number;
    itemIds: string[];
}

export const mentionTargetsOf = (
    items: readonly NotificationItem[],
    cloudId: string,
    channelId: string,
    unreadAbove?: number
): MentionTarget[] => {
    const byRow = new Map<number, string[]>();
    const wasUnread = (item: NotificationItem): boolean =>
        !item.read || (unreadAbove !== undefined && !item.parentId && (item.chatNo ?? 0) > unreadAbove);
    for (const item of items) {
        if (
            !wasUnread(item) ||
            item.cloudId !== cloudId ||
            item.channelId !== channelId ||
            !MENTION_KINDS.has(item.kind)
        ) {
            continue;
        }
        const chatNo = item.parentId ? Number(threadRootNo(item.parentId)) : item.chatNo;
        if (!chatNo || !Number.isFinite(chatNo)) continue;
        byRow.set(chatNo, [...(byRow.get(chatNo) ?? []), item.id]);
    }
    return [...byRow.entries()].sort(([a], [b]) => a - b).map(([chatNo, itemIds]) => ({ chatNo, itemIds }));
};

export const newMessagesSince = (messages: readonly ClientChatView[], sinceChatNo: number): number =>
    messages.filter(message => !message.isOwner && !message.isSystem && (message.chatNo ?? 0) > sinceChatNo).length;

const isRowInView = (container: HTMLElement, chatNo: number): boolean => {
    const row = container.querySelector(`[data-chat-no="${chatNo}"]`);
    if (!row) return false;
    const box = container.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    return rect.bottom > box.top && rect.top < box.bottom;
};

export const useRoomJumpPills = ({
    channelId,
    messages,
    containerRef,
    isAwayFromBottom,
    scrollToBottom,
    readCursor,
    awayFromCursor,
}: {
    channelId: string;
    messages: readonly ClientChatView[];
    containerRef: RefObject<HTMLElement | null>;
    isAwayFromBottom: boolean;
    scrollToBottom: (smooth?: boolean) => void;
    readCursor?: number;
    awayFromCursor?: number;
}) => {
    const cloudId = useSelectedCloudId();
    const roomKey = notificationRoomKey(cloudId, channelId);
    const isRoomComputed = useNotificationStore(state => !!state.computedRooms[roomKey]);

    const entry = useRef({ channelId, cursor: readCursor, late: !isRoomComputed });
    if (entry.current.channelId !== channelId) {
        entry.current = { channelId, cursor: readCursor, late: !isRoomComputed };
    } else if (entry.current.cursor === undefined) {
        entry.current.cursor = readCursor;
    }

    const [mentions, setMentions] = useState<MentionTarget[]>(() =>
        mentionTargetsOf(Object.values(useNotificationStore.getState().items), cloudId, channelId)
    );
    const snapshotFor = useRef(channelId);
    useEffect(() => {
        if (snapshotFor.current === channelId) return;
        snapshotFor.current = channelId;
        setMentions(mentionTargetsOf(Object.values(useNotificationStore.getState().items), cloudId, channelId));
    }, [channelId, cloudId]);
    useEffect(() => {
        const current = entry.current;
        if (!current.late || !isRoomComputed || current.channelId !== channelId) return;
        current.late = false;
        setMentions(
            mentionTargetsOf(
                Object.values(useNotificationStore.getState().items),
                cloudId,
                channelId,
                current.cursor ?? 0
            )
        );
    }, [isRoomComputed, channelId, cloudId]);

    const reach = useCallback((targets: MentionTarget[]) => {
        if (targets.length === 0) return;
        useNotificationStore.getState().markRead(targets.flatMap(target => target.itemIds));
        const reached = new Set(targets.map(target => target.chatNo));
        setMentions(previous => previous.filter(target => !reached.has(target.chatNo)));
    }, []);

    const checkInView = useCallback(() => {
        const container = containerRef.current;
        if (!container || mentions.length === 0) return;
        reach(mentions.filter(target => isRowInView(container, target.chatNo)));
    }, [containerRef, mentions, reach]);
    useEffect(() => {
        checkInView();
    }, [messages, checkInView]);

    const jumpToMention = useCallback(() => {
        const next = mentions[0];
        if (!next) return;
        haptics.play('selection');
        useMessageJumpStore.getState().request(channelId, next.chatNo);
        reach([next]);
    }, [channelId, mentions, reach]);

    const leftAt = useRef<number | null>(null);
    const newestChatNo = messages.length > 0 ? (messages[messages.length - 1].chatNo ?? 0) : 0;
    if (isAwayFromBottom && leftAt.current === null) leftAt.current = awayFromCursor ?? newestChatNo;
    if (!isAwayFromBottom) leftAt.current = null;
    const latestCount = useMemo(
        () => (isAwayFromBottom && leftAt.current !== null ? newMessagesSince(messages, leftAt.current) : 0),
        [isAwayFromBottom, messages]
    );

    const jumpToLatest = useCallback(() => {
        haptics.play('selection');
        scrollToBottom(true);
    }, [scrollToBottom]);

    const pill =
        mentions.length > 0
            ? ({ variant: 'mention', count: mentions.length, onClick: jumpToMention } as const)
            : latestCount > 0
              ? ({ variant: 'latest', count: latestCount, onClick: jumpToLatest } as const)
              : null;

    const firstMentionNo = mentions[0]?.chatNo;

    return { pill, checkInView, firstMentionNo };
};
