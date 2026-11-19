import { describe, expect, it } from 'vitest';

import { soleModifier } from './modifierHold';

const key = (name: string, flags: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
    key: name,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...flags,
});

describe('soleModifier', () => {
    it('reads ⌘ as Mod on macOS and Ctrl as Mod elsewhere', () => {
        expect(soleModifier(key('Meta', { metaKey: true }), true)).toBe('mod');
        expect(soleModifier(key('Control', { ctrlKey: true }), false)).toBe('mod');
    });

    it('ignores the modifier no chord uses on that OS', () => {
        expect(soleModifier(key('Control', { ctrlKey: true }), true)).toBeNull();
        expect(soleModifier(key('Meta', { metaKey: true }), false)).toBeNull();
    });

    it('reads Alt as Alt on both', () => {
        expect(soleModifier(key('Alt', { altKey: true }), true)).toBe('alt');
        expect(soleModifier(key('Alt', { altKey: true }), false)).toBe('alt');
    });

    it('is null when another modifier is already down', () => {
        expect(soleModifier(key('Meta', { metaKey: true, altKey: true }), true)).toBeNull();
        expect(soleModifier(key('Meta', { metaKey: true, shiftKey: true }), true)).toBeNull();
        expect(soleModifier(key('Alt', { altKey: true, metaKey: true }), true)).toBeNull();
        expect(soleModifier(key('Control', { ctrlKey: true, altKey: true }), false)).toBeNull();
    });

    it('is null for any other key', () => {
        expect(soleModifier(key('k', { metaKey: true }), true)).toBeNull();
        expect(soleModifier(key('Shift', { shiftKey: true }), true)).toBeNull();
    });
});
