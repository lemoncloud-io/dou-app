import { describe, expect, it } from 'vitest';

import { cloudTiles, distinctInitials } from './tileInitials';

describe('distinctInitials', () => {
    it('uses one letter while the letters differ', () => {
        expect(distinctInitials(['alpha', 'beta'])).toEqual(['A', 'B']);
    });

    it('widens only the tiles that share a letter', () => {
        expect(distinctInitials(['team', 'Tokyo', 'lemon'])).toEqual(['Te', 'To', 'L']);
    });

    it('keeps Hangul whole and falls back for an empty name', () => {
        expect(distinctInitials(['레몬', '레드', ''])).toEqual(['레몬', '레드', '#']);
    });

    // Both used to read "Te": the first two letters were all the widening looked at.
    it('tells apart names that differ only by a trailing number', () => {
        expect(distinctInitials(['test-lemon2', 'test-lemon'])).toEqual(['T2', 'Te']);
        expect(distinctInitials(['Room 1', 'Room 2', 'Lobby'])).toEqual(['R1', 'R2', 'L']);
    });

    it('keeps a trailing number to two digits', () => {
        expect(distinctInitials(['Room 110', 'Room 111'])).toEqual(['R10', 'R11']);
    });

    it('keeps identical names identical rather than looping', () => {
        expect(distinctInitials(['same', 'same'])).toEqual(['Sa', 'Sa']);
    });
});

describe('cloudTiles', () => {
    const untitled = (ordinal?: number) => (ordinal ? `Untitled cloud ${ordinal}` : 'Untitled cloud');

    it('names a lone untitled cloud without a number', () => {
        expect(cloudTiles([{ id: 'default', name: 'Home' }, { id: '1' }], untitled)).toEqual([
            { label: 'Home', initial: 'H' },
            { label: 'Untitled cloud', initial: '?' },
        ]);
    });

    // Two untitled clouds used to read "Un" and "Un", from the fallback label's own letters.
    it('numbers untitled clouds when there are several', () => {
        const tiles = cloudTiles(
            [{ id: '1', name: '#cloud/1001494/3' }, { id: '2', name: 'Studio' }, { id: '3' }],
            untitled
        );
        expect(tiles).toEqual([
            { label: 'Untitled cloud 1', initial: '?1' },
            { label: 'Studio', initial: 'S' },
            { label: 'Untitled cloud 2', initial: '?2' },
        ]);
    });
});
