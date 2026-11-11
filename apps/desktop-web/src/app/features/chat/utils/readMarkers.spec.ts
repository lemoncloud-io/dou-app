import { describe, expect, it } from 'vitest';

import { placeReadMarkers } from './readMarkers';

const at = (userId: string, cursor: number) => ({ userId, cursor });

// The placement is keyed by message number; the order the map iterates in carries no meaning.
const byChatNo = (placed: Map<number, string[]>) => [...placed].sort(([a], [b]) => a - b);

describe('placeReadMarkers', () => {
    it('puts each member on the message their cursor sits on', () => {
        const placed = placeReadMarkers([at('ada', 7), at('bob', 3), at('cy', 7)], [1, 3, 5, 7]);

        expect(byChatNo(placed)).toEqual([
            [3, ['bob']],
            [7, ['ada', 'cy']],
        ]);
    });

    it('lowers a cursor that sits between two shown messages to the nearest one below', () => {
        // 4 and 6 are numbers a reaction or a system event used up, so no row carries them.
        const placed = placeReadMarkers([at('ada', 4), at('bob', 6)], [3, 5, 8]);

        expect(byChatNo(placed)).toEqual([
            [3, ['ada']],
            [5, ['bob']],
        ]);
    });

    it('puts a cursor past the newest message on the newest message', () => {
        const placed = placeReadMarkers([at('ada', 99)], [2, 5]);

        expect(byChatNo(placed)).toEqual([[5, ['ada']]]);
    });

    it('leaves out a member whose cursor is below the first shown message', () => {
        const placed = placeReadMarkers([at('ada', 1), at('bob', 5)], [3, 5]);

        expect(byChatNo(placed)).toEqual([[5, ['bob']]]);
    });

    it('gives the same placement for unsorted numbers with duplicates', () => {
        const placed = placeReadMarkers([at('ada', 6), at('bob', 2)], [5, 2, 5, 9, 2]);

        expect(byChatNo(placed)).toEqual([
            [2, ['bob']],
            [5, ['ada']],
        ]);
    });

    it('keeps the order the members were given in within one message', () => {
        const placed = placeReadMarkers([at('cy', 5), at('ada', 5), at('bob', 5)], [5]);

        expect(placed.get(5)).toEqual(['cy', 'ada', 'bob']);
    });

    it('leaves out a member whose nearest message is from before they joined', () => {
        // Joining writes the room's latest number into the cursor, so a late joiner's cursor is past
        // messages they never saw. 5 is the last shown message at or below it, and they joined after it.
        const placed = placeReadMarkers([{ userId: 'late', cursor: 9, joinedNo: 6 }, at('ada', 9)], [3, 5]);

        expect(byChatNo(placed)).toEqual([[5, ['ada']]]);
    });

    it('places a late joiner on a message they were there for', () => {
        const placed = placeReadMarkers([{ userId: 'late', cursor: 9, joinedNo: 6 }], [3, 5, 8]);

        expect(byChatNo(placed)).toEqual([[8, ['late']]]);
    });

    it('treats a row with no joinedNo as having been in the room all along', () => {
        const placed = placeReadMarkers([{ userId: 'old', cursor: 4, joinedNo: 0 }], [1, 3]);

        expect(byChatNo(placed)).toEqual([[3, ['old']]]);
    });

    it('places nobody when there are no shown messages or no members', () => {
        expect(placeReadMarkers([at('ada', 5)], []).size).toBe(0);
        expect(placeReadMarkers([], [1, 2]).size).toBe(0);
    });
});
