import type { DomainChat } from '@chatic/data';

export interface MessageGroup {
    key: string;
    ownerId: string | undefined;
    ownerName: string;
    /** True when the signed-in user authored this group — drives delivery status. */
    isMine: boolean;
    timestamp: number;
    messages: DomainChat[];
}

/** A row in the message pane: a day divider, the unread marker, or an author block. */
export type MessageRowItem =
    | { kind: 'date'; key: string; timestamp: number }
    | { kind: 'unread'; key: string }
    | { kind: 'group'; group: MessageGroup };

/** Identity of the signed-in user, used to name their own (and optimistic) messages. */
export interface MessageViewer {
    uid: string | null;
    name: string;
}

/** Split a run of same-author messages when they are more than this far apart. */
const GROUP_TIME_GAP_MS = 5 * 60 * 1000;

// The server's ChatView only embeds owner$ for persisted messages — optimistic
// and own messages have no owner$, so resolve those from the viewer's profile.
// For other authors the server often omits owner$ too, so fall back to the
// channel member roster (id → name) before giving up with "Unknown".
const getOwnerName = (chat: DomainChat, viewer: MessageViewer, names?: ReadonlyMap<string, string>): string => {
    if (viewer.uid && chat.ownerId === viewer.uid) return viewer.name || chat.owner$?.name || 'You';
    const fromMembers = chat.ownerId ? names?.get(chat.ownerId) : undefined;
    return chat.owner$?.name ?? fromMembers ?? 'Unknown';
};

const getTimestamp = (chat: DomainChat): number => chat.createdAt ?? chat.createdAtMs ?? 0;

const isSameDay = (a: number, b: number): boolean => {
    if (!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
};

const startOfDay = (ms: number): number => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

/**
 * Slack-style layout pipeline. Produces a flat list of rows where:
 * - a `date` row is inserted whenever the calendar day changes, and
 * - consecutive messages by the same author within {@link GROUP_TIME_GAP_MS}
 *   collapse into one `group` (single avatar + name + time header).
 */
export const buildMessageRows = (
    messages: DomainChat[],
    viewer: MessageViewer,
    names?: ReadonlyMap<string, string>,
    baselineReadNo = 0
): MessageRowItem[] => {
    const rows: MessageRowItem[] = [];
    let currentGroup: MessageGroup | null = null;
    let lastTimestamp = 0;
    let unreadInserted = false;

    const flush = () => {
        if (currentGroup) rows.push({ kind: 'group', group: currentGroup });
        currentGroup = null;
    };

    for (const message of messages) {
        const timestamp = getTimestamp(message);

        if (!isSameDay(timestamp, lastTimestamp)) {
            flush();
            const dayMs = startOfDay(timestamp);
            rows.push({ kind: 'date', key: `date:${dayMs}`, timestamp: dayMs });
        }

        // Mark the first unread message from someone else (relative to where the
        // reader left off on open). Breaks the current group so the divider sits
        // directly above it.
        const isUnread = (message.chatNo ?? 0) > baselineReadNo && message.ownerId !== viewer.uid;
        if (!unreadInserted && baselineReadNo > 0 && isUnread) {
            flush();
            rows.push({ kind: 'unread', key: `unread:${message.chatNo}` });
            unreadInserted = true;
        }

        const sameAuthor = currentGroup?.ownerId === message.ownerId;
        const withinGap = timestamp - lastTimestamp <= GROUP_TIME_GAP_MS;

        if (currentGroup && sameAuthor && withinGap) {
            currentGroup.messages.push(message);
        } else {
            flush();
            currentGroup = {
                key: message.id ?? message.tempId ?? `${message.channelId}:${message.chatNo}`,
                ownerId: message.ownerId,
                ownerName: getOwnerName(message, viewer, names),
                isMine: viewer.uid != null && message.ownerId === viewer.uid,
                timestamp,
                messages: [message],
            };
        }

        lastTimestamp = timestamp;
    }

    flush();
    return rows;
};
