import type { MessageJumpOrigin } from '../../../shared';
import type { HistoryDirection } from '../stores/useHistoryRequestStore';

/**
 * The rooms the reader moved between on home, as two stacks: what Back steps to and what Forward
 * steps to. Each entry is a whole reading position (cloud, place, channel, the message at the top
 * of the feed, the thread beside it), the same shape a jump records, so a step lands where the
 * reader was reading rather than at the room's latest.
 */
export interface ChannelHistory {
    back: readonly MessageJumpOrigin[];
    forward: readonly MessageJumpOrigin[];
}

export const EMPTY_HISTORY: ChannelHistory = { back: [], forward: [] };

/** Older steps fall off the bottom; nobody presses Back fifty times. */
export const HISTORY_LIMIT = 50;

const keep = (entries: readonly MessageJumpOrigin[]) => entries.slice(-HISTORY_LIMIT);

/** The reader moved to another room on their own: where they left goes on Back, and Forward is gone. */
export const recordMove = (history: ChannelHistory, departure: MessageJumpOrigin): ChannelHistory => ({
    back: keep([...history.back, departure]),
    forward: [],
});

/** The same room in the same place: the self room is listed by every place under one id. */
export const sameRoom = (a: MessageJumpOrigin, b: MessageJumpOrigin): boolean =>
    a.cloudId === b.cloudId && a.placeId === b.placeId && a.channelId === b.channelId;

/**
 * One step Back or Forward from `current`. Entries the reader can no longer reach (a room they were
 * removed from) and entries for the room they are already in are passed over and dropped, so one
 * press always moves somewhere. `current` goes on the other stack, so the opposite press returns
 * to it. Null when there is nowhere to go; the history is then left as it was.
 */
export const stepHistory = (
    history: ChannelHistory,
    direction: HistoryDirection,
    current: MessageJumpOrigin | null,
    reachable: (entry: MessageJumpOrigin) => boolean
): { history: ChannelHistory; target: MessageJumpOrigin } | null => {
    const from = [...(direction === 'back' ? history.back : history.forward)];
    const to = [...(direction === 'back' ? history.forward : history.back)];
    let target = from.pop();
    while (target && (!reachable(target) || (current && sameRoom(target, current)))) target = from.pop();
    if (!target) return null;
    if (current) to.push(current);
    return {
        history: direction === 'back' ? { back: from, forward: keep(to) } : { back: keep(to), forward: from },
        target,
    };
};
