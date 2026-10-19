import { pushRoomPlace } from './pushRoomPlace';

describe('pushRoomPlace', () => {
    // B wrote from P1; the room lives in P2.
    it("lands a 1:1 push on the room's cached place, not the place its sender was in", () => {
        expect(pushRoomPlace('me@peer', 'P1', { id: 'me@peer', sid: 'P2', stereo: 'dm', cid: 'c1' } as never)).toBe(
            'P2'
        );
    });

    it('lands an uncached 1:1 push on the place its id names', () => {
        expect(pushRoomPlace('P2@me@peer', 'P1', null)).toBe('P2');
    });

    it('falls back to the push place for a 1:1 that names no place', () => {
        expect(pushRoomPlace('me@peer', 'P1', { id: 'me@peer', sid: '', stereo: 'dm', cid: 'c1' } as never)).toBe('P1');
    });

    it('keeps the push place for a relay 1:1', () => {
        expect(
            pushRoomPlace('me@peer', 'P1', { id: 'me@peer', sid: '0000', stereo: 'dm', cid: 'default' } as never)
        ).toBe('P1');
    });

    it('keeps the push place for a group channel, and for a path with no room', () => {
        expect(pushRoomPlace('1000006', 'P1', { id: '1000006', sid: 'P1', stereo: 'private' } as never)).toBe('P1');
        expect(pushRoomPlace('1000006', 'P1', null)).toBe('P1');
        expect(pushRoomPlace(null, 'P1', null)).toBe('P1');
        expect(pushRoomPlace(null, null, null)).toBeNull();
    });
});
