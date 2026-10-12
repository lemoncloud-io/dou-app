import { describe, expect, it } from 'vitest';

import { isChannelReadLive, registerLiveRead } from './liveReadRegistry';

describe('liveReadRegistry', () => {
    it('reports a channel live between register and unregister', () => {
        const unregister = registerLiveRead('ch-1');
        expect(isChannelReadLive('ch-1')).toBe(true);
        expect(isChannelReadLive('ch-9')).toBe(false);
        unregister();
        expect(isChannelReadLive('ch-1')).toBe(false);
    });

    it('keeps channels independent of each other', () => {
        const unregisterA = registerLiveRead('ch-a');
        const unregisterB = registerLiveRead('ch-b');
        unregisterA();
        expect(isChannelReadLive('ch-a')).toBe(false);
        expect(isChannelReadLive('ch-b')).toBe(true);
        unregisterB();
    });
});
