import type { MessageJumpOrigin } from '../../../shared';
import type { HistoryDirection } from '../stores/useHistoryRequestStore';

export interface ChannelHistory {
    back: readonly MessageJumpOrigin[];
    forward: readonly MessageJumpOrigin[];
}

export const EMPTY_HISTORY: ChannelHistory = { back: [], forward: [] };

export const HISTORY_LIMIT = 50;

const keep = (entries: readonly MessageJumpOrigin[]) => entries.slice(-HISTORY_LIMIT);

export const recordMove = (history: ChannelHistory, departure: MessageJumpOrigin): ChannelHistory => ({
    back: keep([...history.back, departure]),
    forward: [],
});

export const sameRoom = (a: MessageJumpOrigin, b: MessageJumpOrigin): boolean =>
    a.cloudId === b.cloudId && a.placeId === b.placeId && a.channelId === b.channelId;

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
