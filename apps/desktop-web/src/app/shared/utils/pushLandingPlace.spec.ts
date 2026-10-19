import { describe, expect, it } from 'vitest';

import { pushLandingPlace } from './pushLandingPlace';

describe('pushLandingPlace', () => {
    // B wrote from P1; the room lives in P2.
    it("lands a 1:1 push on the room's cached place, not the place its sender was in", () => {
        expect(
            pushLandingPlace({ channelId: 'me@peer', sid: 'P1' }, { id: 'me@peer', sid: 'P2', stereo: 'dm' }, 'cloud-9')
        ).toBe('P2');
    });

    it('lands an uncached 1:1 push on the place its id names', () => {
        expect(pushLandingPlace({ channelId: 'P2@me@peer', sid: 'P1' }, null, null)).toBe('P2');
    });

    it('falls back to the push place for a 1:1 that names no place', () => {
        expect(
            pushLandingPlace({ channelId: 'me@peer', sid: 'P1' }, { id: 'me@peer', sid: '', stereo: 'dm' }, 'cloud-9')
        ).toBe('P1');
    });

    it('lands a group channel push on the push place', () => {
        expect(
            pushLandingPlace(
                { channelId: '1000006', sid: 'P1' },
                { id: '1000006', sid: 'P1', stereo: 'private' },
                'cloud-9'
            )
        ).toBe('P1');
        expect(pushLandingPlace({ channelId: '1000006', sid: 'P1' }, null, 'cloud-9')).toBe('P1');
    });

    it("keeps a relay 1:1's push on the push place", () => {
        expect(
            pushLandingPlace(
                { channelId: 'me@peer', sid: 'P1' },
                { id: 'me@peer', sid: '0000', stereo: 'dm' },
                'default'
            )
        ).toBe('P1');
    });

    it('lands nowhere in particular when nothing names a place', () => {
        expect(pushLandingPlace({ channelId: '1000006' }, null, null)).toBe('');
    });
});
