import { describe, expect, it } from 'vitest';

import { historyChord, historyMouseButton } from './historyNavigation';

const key = (over: Partial<Parameters<typeof historyChord>[0]>) => ({
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: '[',
    code: 'BracketLeft',
    ...over,
});

describe('historyChord', () => {
    it('takes Cmd+[ and Ctrl+[ as Back', () => {
        expect(historyChord(key({ metaKey: true }))).toBe('back');
        expect(historyChord(key({ ctrlKey: true }))).toBe('back');
    });

    it('takes Cmd+] as Forward', () => {
        expect(historyChord(key({ metaKey: true, key: ']', code: 'BracketRight' }))).toBe('forward');
    });

    it('reads the physical key, so a layout reporting another character still has the chord', () => {
        expect(historyChord(key({ metaKey: true, key: 'ㅔ' }))).toBe('back');
    });

    it('leaves a bare bracket to typing and Shift or Alt chords to whatever binds them', () => {
        expect(historyChord(key({}))).toBeNull();
        expect(historyChord(key({ metaKey: true, shiftKey: true }))).toBeNull();
        expect(historyChord(key({ metaKey: true, altKey: true }))).toBeNull();
    });

    it('ignores other keys under the modifier', () => {
        expect(historyChord(key({ metaKey: true, key: 'k', code: 'KeyK' }))).toBeNull();
    });
});

describe('historyMouseButton', () => {
    it('reads the side buttons as Back and Forward', () => {
        expect(historyMouseButton(3)).toBe('back');
        expect(historyMouseButton(4)).toBe('forward');
    });

    it('ignores the main buttons', () => {
        expect(historyMouseButton(0)).toBeNull();
        expect(historyMouseButton(1)).toBeNull();
        expect(historyMouseButton(2)).toBeNull();
    });
});
