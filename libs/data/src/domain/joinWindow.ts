import type { DomainChat } from './models';

/**
 * Join-window visibility — whether a cached chat row belongs to MY current membership.
 *
 * Leaving a channel and coming back must look like arriving for the first time: the server resets
 * the join cursors on re-join and then windows the feed by `joinedNo` ("이 번호 이전의 메시지는
 * 조회 대상에서 제외"), so it stops handing back anything from before. The client cannot rely on
 * that alone, because it renders the local chat cache rather than the response — rows fetched
 * while I was still a member survive the leave (the chat sync plan deliberately keeps message
 * history for lazy-load/offline, and `refreshList` merges without pruning).
 *
 * This is the client half of the same rule, applied where the cache is read. Kept apart from
 * `chatPreview.ts` on purpose: that module answers "is this row fit to stand as a preview", a
 * property of the row itself, while this one answers "am I entitled to see it", a property of my
 * membership. Folding them together would make one predicate that changes for two unrelated
 * reasons (ADR-0067).
 */

/**
 * True when a chat row is inside my current join window.
 *
 * Mirrors the server's `chatNo > joinedNo` guard, with two deliberate escapes:
 *
 * - **No `joinedNo`** — nothing to compare against, so nothing is hidden. Join rows written before
 *   the server started carrying the field have none, and guessing on their behalf would blank out
 *   real history. Same direction as `hasLeftChannel`: an absent field can only ever decline to act.
 * - **No `chatNo`** — an optimistic send carries the sentinel `chatNo: 0` until the server assigns
 *   one, so a plain `chatNo > joinedNo` would hide the message the user just typed. A row with no
 *   server number is by definition one I created after joining.
 */
export const isInJoinWindow = (chat: Pick<DomainChat, 'chatNo'>, joinedNo?: number): boolean =>
    !joinedNo || !chat.chatNo || chat.chatNo > joinedNo;
