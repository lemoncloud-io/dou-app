import { describe, expect, it } from 'vitest';

import { isBackChord } from './backNavigation';

const key = (over: Partial<Parameters<typeof isBackChord>[0]>) => ({
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: '[',
    code: 'BracketLeft',
    ...over,
});

describe('isBackChord', () => {
    it('takes Cmd+[ and Ctrl+[', () => {
        expect(isBackChord(key({ metaKey: true }))).toBe(true);
        expect(isBackChord(key({ ctrlKey: true }))).toBe(true);
    });

    it('reads the physical key, so a layout reporting another character still has the chord', () => {
        expect(isBackChord(key({ metaKey: true, key: 'ㅔ' }))).toBe(true);
    });

    it('leaves a bare [ to typing and Shift or Alt chords to whatever binds them', () => {
        expect(isBackChord(key({}))).toBe(false);
        expect(isBackChord(key({ metaKey: true, shiftKey: true }))).toBe(false);
        expect(isBackChord(key({ metaKey: true, altKey: true }))).toBe(false);
    });

    it('ignores other keys under the modifier', () => {
        expect(isBackChord(key({ metaKey: true, key: ']', code: 'BracketRight' }))).toBe(false);
    });
});
