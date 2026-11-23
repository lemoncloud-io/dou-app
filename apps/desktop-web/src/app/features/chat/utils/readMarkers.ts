import { isInJoinWindow } from '@chatic/runtime';

import type { MemberReadCursor } from '../../../shared';

export const placeReadMarkers = (
    cursors: readonly MemberReadCursor[],
    chatNos: readonly number[]
): Map<number, string[]> => {
    const placed = new Map<number, string[]>();
    const sorted = [...new Set(chatNos)].sort((a, b) => a - b);

    for (const { userId, cursor, joinedNo } of cursors) {
        let low = 0;
        let high = sorted.length - 1;
        let reached: number | undefined;
        while (low <= high) {
            const mid = (low + high) >> 1;
            const candidate = sorted[mid];
            if (candidate !== undefined && candidate <= cursor) {
                reached = candidate;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        if (reached === undefined || !isInJoinWindow({ chatNo: reached }, joinedNo)) continue;

        const members = placed.get(reached);
        if (members) members.push(userId);
        else placed.set(reached, [userId]);
    }
    return placed;
};
