import { isInJoinWindow } from '@chatic/data';

import type { MemberReadCursor } from '../../../shared';

/**
 * Where each member's read position falls among the messages on screen.
 *
 * A cursor does not have to land on a shown message — reactions and system events use up message
 * numbers too, so it often sits between two rows. It is lowered to the nearest shown message at or
 * below it, which is the last message that member is known to have reached. A cursor below the first
 * shown message points into history that is not loaded, so that member is placed nowhere rather
 * than guessed onto a row. Nor is a member placed on a message from before they joined: joining writes
 * the room's latest number into the cursor too, so a late joiner's cursor passes messages they never
 * saw, and the list a marker opens does not name them for those messages either.
 *
 * Returns, per shown message number, the members placed on it in the order they were given.
 * `chatNos` need not be sorted or unique.
 */
export const placeReadMarkers = (
    cursors: readonly MemberReadCursor[],
    chatNos: readonly number[]
): Map<number, string[]> => {
    const placed = new Map<number, string[]>();
    const sorted = [...new Set(chatNos)].sort((a, b) => a - b);

    for (const { userId, cursor, joinedNo } of cursors) {
        // Binary search for the last shown number that is <= cursor.
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
