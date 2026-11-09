import { MemoryMedium } from './memoryMedium';
import { TolerantMedium } from './tolerantMedium';

import type { KeyValueStore } from './types';

const throwing = (): KeyValueStore => ({
    get: () => {
        throw new Error('blocked');
    },
    set: () => {
        throw new Error('quota');
    },
    remove: () => {
        throw new Error('blocked');
    },
    clear: () => {
        throw new Error('blocked');
    },
    keys: () => {
        throw new Error('blocked');
    },
});

describe('TolerantMedium', () => {
    it('passes every call through to the medium it wraps', () => {
        const inner = new MemoryMedium();
        const medium = new TolerantMedium(inner);
        medium.set('k', 'v');
        expect(inner.get('k')).toBe('v');
        expect(medium.get('k')).toBe('v');
        expect(medium.keys()).toEqual(['k']);
        medium.remove('k');
        expect(inner.get('k')).toBeNull();
    });

    it('answers a failed read as absent and a failed listing as empty', () => {
        const medium = new TolerantMedium(throwing());
        expect(medium.get('k')).toBeNull();
        expect(medium.keys()).toEqual([]);
    });

    it('swallows a failed write, remove and clear', () => {
        const medium = new TolerantMedium(throwing());
        expect(() => medium.set('k', 'v')).not.toThrow();
        expect(() => medium.remove('k')).not.toThrow();
        expect(() => medium.clear()).not.toThrow();
    });
});
