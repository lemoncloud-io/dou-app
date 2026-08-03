import type { DomainChat } from '@chatic/data';

import { isPlaceholderName, resolveDisplay } from '../../../shared/utils';

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

/** A row in the message pane: a day divider, the unread marker, the thread
 * "N replies" divider, a system notice, or an author block. */
export type MessageRowItem =
    | { kind: 'date'; key: string; timestamp: number }
    | { kind: 'unread'; key: string }
    | { kind: 'replies'; key: string; count: number }
    | { kind: 'system'; key: string; chat: DomainChat; authorName: string }
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

// An id is "mine" when it matches either my account id (optimistic messages carry it)
// or my per-channel cloud user id (the server rewrites the owner to this once the
// message persists) — so my own rows stay identified across the optimistic→persisted
// swap. Every surface that asks "is this me" goes through here; the rule is subtle
// enough that a second copy would drift.
export const isViewerId = (userId: string | undefined, viewer: MessageViewer): boolean =>
    (!!viewer.uid && userId === viewer.uid) || (!!viewer.cloudUid && userId === viewer.cloudUid);

export const isOwnMessage = (chat: DomainChat, viewer: MessageViewer): boolean => isViewerId(chat.ownerId, viewer);

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
    membersLoading = false,
    /** uid → active Place Profile for the current place; overrides nick/thumbnail. */
    placeProfiles: Record<string, { nick?: string; thumbnail?: string }> = {},
    /**
     * Thread-panel only: total replies under the open root. When set, a Slack-style
     * "N replies" divider is dropped above the first reply (the first message with a
     * `parentId`). Undefined in the main feed, where no such divider appears.
     */
    threadReplyCount?: number
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

        // Thread view: a Slack-style "N replies" divider sits above the first reply
        // (the first message carrying a parentId). Flush first so the root and an
        // immediately-following same-author reply don't merge across the divider.
        if (isThread && !repliesInserted && message.parentId) {
            flush();
            rows.push({ kind: 'replies', key: 'thread-replies', count: threadReplyCount });
            repliesInserted = true;
        }

        // Only the main feed inserts day dividers. The thread panel shows none —
        // each message header carries the day inline (Slack-style "Today at 3:28
        // PM"), so the parent's date and a cross-day reply read without the divider
        // soup of stacking "1 reply" + a date pill.
        if (!isThread && !isSameDay(timestamp, lastTimestamp)) {
            flush();
            const dayMs = startOfDay(timestamp);
            // Suffix with the message key: chatNo-sorted rows can revisit a day
            // (e.g. a pending optimistic row sorts last but keeps its old
            // createdAt), so a bare day key would collide (React dup-key).
            rows.push({
                kind: 'date',
                key: `date:${dayMs}:${message.id ?? message.tempId ?? message.chatNo}`,
                timestamp: dayMs,
            });
        }

        // A server-generated event (someone joined or left) is a notice, not a message:
        // it breaks the author block, never merges with the messages around it, and does
        // not anchor the unread divider — landing on "new messages" only to find a join
        // event is worse than landing on the first real message below it.
        if (message.stereo === 'system') {
            flush();
            rows.push({
                kind: 'system',
                key: message.id ?? message.tempId ?? `system:${message.channelId}:${message.chatNo}`,
                chat: message,
                authorName: resolveOwnerName(message, viewer, names) ?? '',
            });
            lastTimestamp = timestamp;
            continue;
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
            // Place Profile override: look up by the canonical uid — for my own
            // messages that is my cloud id (the server rewrites ownerId on persist),
            // matching the colorSeed/isOwnMessage logic.
            // For my own messages the override may be keyed by either my cloud id
            // (server-rewritten ownerId / sync) or my account id (the optimistic
            // self-write uses the account uid) — try both. Others key by ownerId.
            const place = isMine
                ? ((viewer.cloudUid ? placeProfiles[viewer.cloudUid] : undefined) ??
                  (viewer.uid ? placeProfiles[viewer.uid] : undefined) ??
                  (message.ownerId ? placeProfiles[message.ownerId] : undefined))
                : message.ownerId
                  ? placeProfiles[message.ownerId]
                  : undefined;
            const placeNick = place?.nick?.trim();
            // Same single merge as every other surface (resolveDisplay): a Place
            // nick/thumbnail overrides the global fallback resolved above.
            const display = resolveDisplay(place, resolvedName ?? '', message.owner$?.thumbnail);
            currentGroup = {
                key: message.id ?? message.tempId ?? `${message.channelId}:${message.chatNo}`,
                ownerId: message.ownerId,
                ownerName: display.name || 'Unknown',
                namePending: !placeNick && resolvedName === null && membersLoading,
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
    return rows;
};
