import { describe, expect, it } from 'vitest';

import { distinctInitials } from './tileInitials';

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
});
