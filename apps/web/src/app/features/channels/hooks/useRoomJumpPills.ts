import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { haptics } from '../../../bridge/haptics';
import { useSelectedCloudId } from '../../../hooks/useCloudScope';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { notificationRoomKey, useNotificationStore } from '../../../stores/useNotificationStore';
import { MENTION_KINDS, threadRootNo, type NotificationItem } from '../../../utils/notifications';
import type { ClientChatView } from '../types';

/** One unread mention of the reader in this room, by the row it points at. */
interface MentionTarget {
    /** The row to jump to: the message itself, or — for a thread mention — the thread's root in the room. */
    chatNo: number;
    /** The inbox items it stands for, read once it is reached. */
    itemIds: string[];
}

/**
 * The room's unread mentions of the reader, oldest first, as they stood when the room was opened.
 * Read at entry because entering moves the read cursor, and the cursor reads the room's items in the
 * inbox — after that, nothing would be left to point at.
 *
 * `unreadAbove` is the cursor the room was entered at, for a snapshot taken after the cursor may have
 * moved: a top-level mention above it counts as unread, whatever the cursor says now.
 */
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

/** How many messages from others arrived after `sinceChatNo` — the "latest messages" count. */
export const newMessagesSince = (messages: readonly ClientChatView[], sinceChatNo: number): number =>
    messages.filter(message => !message.isOwner && !message.isSystem && (message.chatNo ?? 0) > sinceChatNo).length;

const isRowInView = (container: HTMLElement, chatNo: number): boolean => {
    const row = container.querySelector(`[data-chat-no="${chatNo}"]`);
    if (!row) return false;
    const box = container.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    return rect.bottom > box.top && rect.top < box.bottom;
};

/**
 * The room's two floating shortcuts (Figma 6002:40133 · 6002:41749):
 * - **mentions** — the reader's unread mentions here, taken when the room opens. A tap jumps to the
 *   oldest one left (through the jump store, which scrolls and highlights it) and reads it; a mention
 *   scrolled into view by hand counts as reached too.
 * - **latest** — while the reader is away from the newest messages, how many have arrived from others
 *   since they left; a tap returns to the bottom.
 * Mentions win when both apply.
 */
export const useRoomJumpPills = ({
    channelId,
    messages,
    containerRef,
    isAwayFromBottom,
    scrollToBottom,
    readCursor,
}: {
    channelId: string;
    messages: readonly ClientChatView[];
    containerRef: RefObject<HTMLElement | null>;
    isAwayFromBottom: boolean;
    scrollToBottom: (smooth?: boolean) => void;
    /** The room's read cursor as the page has it; undefined until its join is known. */
    readCursor?: number;
}) => {
    const cloudId = useSelectedCloudId();
    const roomKey = notificationRoomKey(cloudId, channelId);
    const isRoomComputed = useNotificationStore(state => !!state.computedRooms[roomKey]);

    // Where the reader entered: the first cursor known for this room, taken before entering moves it.
    // `late` marks a snapshot taken before the inbox had worked the room out — a cold launch straight
    // into the room — which is taken again, from this cursor, once it has.
    const entry = useRef({ channelId, cursor: readCursor, late: !isRoomComputed });
    if (entry.current.channelId !== channelId) {
        entry.current = { channelId, cursor: readCursor, late: !isRoomComputed };
    } else if (entry.current.cursor === undefined) {
        entry.current.cursor = readCursor;
    }

    const [mentions, setMentions] = useState<MentionTarget[]>(() =>
        mentionTargetsOf(Object.values(useNotificationStore.getState().items), cloudId, channelId)
    );
    // A new room (the route reused for another channel) takes its own snapshot.
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

    /** Drops every mention whose row is on screen. Run on scroll and as the list changes. */
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

    // The newest message when the reader left the bottom; what arrives after it is "latest".
    const leftAt = useRef<number | null>(null);
    const newestChatNo = messages.length > 0 ? (messages[messages.length - 1].chatNo ?? 0) : 0;
    if (isAwayFromBottom && leftAt.current === null) leftAt.current = newestChatNo;
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

    return { pill, checkInView };
};
