import type { DomainChat } from '@chatic/data';

import { isPlaceholderName } from '../../../shared/utils';

export interface MessageGroup {
    key: string;
    ownerId: string | undefined;
    ownerName: string;
    /**
     * True while the author name is still resolving (no owner$ yet and the member
     * roster is still loading). The header shows a name skeleton instead of
     * flashing "Unknown" before the roster / live record arrives.
     */
    namePending: boolean;
    /** Author avatar (base64 thumbnail) when the server embedded it; else undefined. */
    avatar: string | undefined;
    /** True when the signed-in user authored this group — drives delivery status. */
    isMine: boolean;
    /**
     * Seed for the deterministic avatar color. For my own messages this is my
     * canonical id (cloud id, falling back to account id) so the optimistic and
     * persisted copies share one color — the server rewrites ownerId from my
     * account id to my cloud id on persist, which would otherwise flip the hue.
     */
    colorSeed: string;
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
    /**
     * My per-channel cloud user id (`channel.$join.userId`). Optimistic messages
     * carry my account id as `ownerId`, but the server rewrites it to this cloud
     * id once the message persists — so both ids identify my own messages.
     */
    cloudUid?: string | null;
}

/** Split a run of same-author messages when they are more than this far apart. */
const GROUP_TIME_GAP_MS = 5 * 60 * 1000;

// A blank or UUID-style name (guest auto-name) is not a real name — treat it as
// unresolved so it never shows, falling back to "You" / the roster / a skeleton.
const realName = (name?: string): string | undefined => (isPlaceholderName(name) ? undefined : name?.trim());

// A message is "mine" when its owner matches either my account id (optimistic
// messages carry it) or my per-channel cloud user id (the server rewrites the
// owner to this once the message persists) — so own messages stay identified
// across the optimistic→persisted swap.
export const isOwnMessage = (chat: DomainChat, viewer: MessageViewer): boolean =>
    (!!viewer.uid && chat.ownerId === viewer.uid) || (!!viewer.cloudUid && chat.ownerId === viewer.cloudUid);

// The server's ChatView only embeds owner$ for persisted messages — optimistic
// and own messages have no owner$, so resolve those from the viewer's profile.
// For other authors the server often omits owner$ too, so fall back to the
// channel member roster (id → name). Returns null when the author is still
// unresolved, so the caller can show a skeleton while it loads instead of "Unknown".
const resolveOwnerName = (
    chat: DomainChat,
    viewer: MessageViewer,
    names?: ReadonlyMap<string, string>
): string | null => {
    if (isOwnMessage(chat, viewer)) {
        // Name my own messages the same way whether optimistic (no owner$, owner is
        // my account id) or persisted (owner$ present, owner is my cloud id): prefer
        // my profile name, then my cloud display name from the roster, so the author
        // never flashes "You" before the persisted record settles.
        const fromCloud = viewer.cloudUid ? realName(names?.get(viewer.cloudUid)) : undefined;
        return realName(viewer.name) || fromCloud || realName(chat.owner$?.name) || 'You';
    }
    const fromOwner = realName(chat.owner$?.name);
    const fromMembers = chat.ownerId ? realName(names?.get(chat.ownerId)) : undefined;
    return fromOwner || fromMembers || null;
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
    baselineReadNo = 0,
    membersLoading = false
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
        // directly above it. Use isOwnMessage (not a raw uid compare): the server
        // rewrites my own messages' ownerId to my cloud id once persisted, so a
        // plain `!== viewer.uid` would mis-flag my own messages as unread and pin
        // the divider above them forever.
        const isUnread = (message.chatNo ?? 0) > baselineReadNo && !isOwnMessage(message, viewer);
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
            const resolvedName = resolveOwnerName(message, viewer, names);
            const isMine = isOwnMessage(message, viewer);
            currentGroup = {
                key: message.id ?? message.tempId ?? `${message.channelId}:${message.chatNo}`,
                ownerId: message.ownerId,
                ownerName: resolvedName ?? 'Unknown',
                namePending: resolvedName === null && membersLoading,
                avatar: message.owner$?.thumbnail,
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
    return rows;
};
