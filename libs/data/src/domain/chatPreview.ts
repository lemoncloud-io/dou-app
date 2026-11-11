import type { DomainChat } from './models';

/**
 * Chat-preview semantics — which chat stands as a channel's one-line preview, and which of two
 * chats is newer. Owned by the data layer (not the web app) because the last-chat fast path
 * (ADR-0057) needs the SAME judgement in two more places: validating rows the native SQL probe
 * returns, and re-deriving the preview in the old-app fallback that scans a cached window.
 *
 * `apps/web/src/app/utils/chat.ts` re-exports these; `apps/desktop-web` keeps its own copy
 * (`shared/utils/chatSort.ts`) — reference only, never edited from here.
 */

/**
 * True when a system message's subject is the current user (e.g. "you joined the channel").
 * Such rows carry no information for that user, so display layers (room list, home preview)
 * hide them. On a system row `ownerId` is the actor who joined/left — not the room owner.
 * The empty-uid guard keeps pre-auth renders from matching rows whose ownerId is also empty.
 */
export const isOwnSystemChat = (chat: Pick<DomainChat, 'stereo' | 'ownerId'>, uid: string): boolean =>
    chat.stereo === 'system' && !!uid && chat.ownerId === uid;

/**
 * Order two chats oldest→newest by chatNo. chatNo is a 1-based sequence; an
 * optimistic (still-pending) send carries the sentinel `chatNo: 0`, so treat 0
 * (and a missing no) as newest — a just-sent message sorts to the bottom, not
 * above older ones. createdAt breaks ties so multiple pendings keep send order.
 */
export const compareByChatNo = (a: DomainChat, b: DomainChat): number => {
    const an = a.chatNo || Number.MAX_SAFE_INTEGER;
    const bn = b.chatNo || Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
};

/**
 * Whether a chat is something a person wrote, as opposed to a server-generated event.
 * Everything the server generates itself arrives as `stereo === 'system'`: join and
 * leave events, and reaction events (`subType: 'reaction'`). Those carry no readable
 * body of their own.
 *
 * The guard is on `stereo` rather than the individual `subType`s on purpose. New
 * subtypes are added server-side before this build knows their names, and the default
 * for anything machine-generated is silence.
 */
export const isNotifiableChat = (chat: Pick<DomainChat, 'stereo'>): boolean => chat.stereo !== 'system';

/**
 * Whether a chat is an event about another message rather than a message: a reaction toggle
 * (`reaction`) or a revision notice (`edit`, written by the server each time a message is edited or
 * deleted). Neither is drawn or counted as a message. A reaction is folded into chips under the
 * message it points at; a revision only says which message changed (`edit$.chatId`), and the
 * repository brings that message to its current state instead.
 */
export const isEventChat = (chat: Pick<DomainChat, 'subType'>): boolean =>
    chat.subType === 'reaction' || chat.subType === 'edit';

/**
 * Whether a chat belongs in the main channel feed.
 *
 * Two reasons to hide a row arrived from different directions and, kept apart, they
 * drift: thread replies live on the thread page (ADR 0008/0045), and event rows
 * (`isEventChat` — reactions and revisions) are ordinary chats the reader must never see as
 * messages. A revision left in the feed is drawn as an empty notice line.
 *
 * Deleted messages stay. The server's delete is a soft delete — the row survives and
 * comes back on the next sync — and the feed keeps it in place as a tombstone rather
 * than closing the gap. System rows (join/leave) are deliberately visible too — they
 * render as a notice line rather than a message.
 */
export const isFeedVisible = (chat: Pick<DomainChat, 'parentId' | 'subType'>): boolean =>
    !chat.parentId && !isEventChat(chat);

/**
 * Whether a chat can stand as a channel's one-line preview on the home list.
 *
 * Reaction events never do — they are the input to `foldReactions`, not messages — and neither
 * do system rows, because join and leave carry no body, so previewing one leaves the home row
 * showing a blank line where a message should be. The system-row test is `isNotifiableChat`, the
 * one the push and unread surfaces use, so "which chats are real messages" cannot drift between them.
 *
 * Thread replies never do either. The row prints what the room itself shows, and the room's feed
 * leaves replies to the thread page, so a reply as the preview would name a message the reader
 * cannot find in the room — tapping the row lands on a feed that does not contain it. The native
 * fast path mirrors this rule in SQL; an app whose mirror still admits replies answers with a
 * reply, which fails this check, and that channel falls back to the windowed query.
 *
 * A failed send does not preview either. It never reached the channel — nobody else
 * can see it — and it keeps the sentinel `chatNo: 0` indefinitely, so ranked as newest
 * it would hold the preview until the sender retried or discarded it.
 *
 * A tombstone (`hidden`) DOES preview — it is still the channel's last message; the
 * row renders the shared deleted-message phrase instead of the body (ADR-0047).
 */
export const isPreviewableChat = (chat: DomainChat): boolean => !chat.parentId && isActivityChat(chat);

/**
 * Whether a chat counts as the room's latest activity: any message a person wrote anywhere in
 * the room, a thread reply included. It is `isPreviewableChat` without the reply rule, so the two
 * can only differ by replies. The home row prints the preview but takes its time, and so the
 * room's place in the list, from this one.
 */
export const isActivityChat = (chat: DomainChat): boolean =>
    !isEventChat(chat) && isNotifiableChat(chat) && !chat.isFailed;

/**
 * The newest previewable chat in an observed window, or undefined when it holds none
 * (a channel whose recent traffic is all reactions and system rows shows no preview).
 *
 * Newest is `compareByChatNo`'s order, not the raw number — a just-sent pending row
 * carries the sentinel `chatNo: 0` and would lose every numeric comparison.
 */
export const pickPreviewChat = (chats: DomainChat[]): DomainChat | undefined => pickNewest(chats, isPreviewableChat);

/** The newest chat in a window that counts as activity (`isActivityChat`) — a thread reply included. */
export const pickActivityChat = (chats: DomainChat[]): DomainChat | undefined => pickNewest(chats, isActivityChat);

const pickNewest = (chats: DomainChat[], accepts: (chat: DomainChat) => boolean): DomainChat | undefined =>
    chats.reduce<DomainChat | undefined>(
        (best, chat) => (accepts(chat) && (!best || compareByChatNo(best, chat) <= 0) ? chat : best),
        undefined
    );

/**
 * One channel's last-chat reading, as the home list consumes it (ADR-0057).
 *
 * `lastNo` is the channel cache's max chatNo across EVERY row type — reactions and thread
 * replies included — so a head-driven refresh can compare against it without mistaking
 * "the newest rows are not previewable" for "the cache is behind".
 */
export interface DomainLastChat {
    channelId: string;
    lastNo: number;
    /** The newest previewable row (never a thread reply), or null when the channel has nothing to preview. */
    chat: DomainChat | null;
    /**
     * The newest row that counts as activity, a thread reply included, or null when there is none.
     * It is `chat` or newer. The home row's time and order read it, so a reply moves the room up
     * the list while the printed line stays on the last message the room shows.
     */
    activity: DomainChat | null;
}
