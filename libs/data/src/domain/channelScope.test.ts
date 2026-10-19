import { ACCOUNT_CHANNEL_SID, dmPlaceOf, isCloudDm, isInPlaceList, placeOfDmId, RELAY_CLOUD_ID } from './channelScope';

const room = (over: Record<string, unknown>) => ({ stereo: 'private', cid: '1000001', sid: 'S:one', ...over }) as never;

describe('isInPlaceList', () => {
    it('keeps a group in its own place and out of every other', () => {
        expect(isInPlaceList(room({ sid: 'S:one' }), 'S:one')).toBe(true);
        expect(isInPlaceList(room({ sid: 'S:one' }), 'S:two')).toBe(false);
    });

    it('keeps a relay 1:1 in the relay place it lives in', () => {
        expect(isInPlaceList(room({ stereo: 'dm', cid: RELAY_CLOUD_ID, sid: '0000' }), '0000')).toBe(true);
    });

    // A cloud 1:1 now lives in the place it was opened in, like a group room.
    it('keeps a cloud 1:1 in its own place and out of every other', () => {
        expect(isInPlaceList(room({ stereo: 'dm', sid: 'S:opened-here' }), 'S:opened-here')).toBe(true);
        expect(isInPlaceList(room({ stereo: 'dm', sid: 'S:opened-here' }), 'S:elsewhere')).toBe(false);
    });

    it('keeps a 1:1 that names no place out of every place list', () => {
        expect(isInPlaceList(room({ stereo: 'dm', sid: '' }), 'S:one')).toBe(false);
    });
});

describe('placeOfDmId', () => {
    it('reads the place from a place-keyed 1:1 id', () => {
        expect(placeOfDmId('1000008@u1@u2')).toBe('1000008');
    });

    // A room opened before 1:1s were keyed by place keeps its pair key, which names no place.
    it('finds no place in a pair key', () => {
        expect(placeOfDmId('u1@u2')).toBe('');
    });

    it('finds no place in the account sid, an empty part or a missing id', () => {
        expect(placeOfDmId(ACCOUNT_CHANNEL_SID)).toBe('');
        expect(placeOfDmId('@u1@u2')).toBe('');
        expect(placeOfDmId('S@u1@u2@u3')).toBe('');
        expect(placeOfDmId('')).toBe('');
        expect(placeOfDmId(undefined)).toBe('');
    });
});

describe('dmPlaceOf', () => {
    // The place a place-keyed id names is fixed for the room's life; no field can disagree with it.
    it('reads a place-keyed id first', () => {
        expect(dmPlaceOf({ id: 'S1@u1@u2', sid: 'S9' })).toBe('S1');
        expect(dmPlaceOf({ id: 'S1@u1@u2', sid: '' })).toBe('S1');
    });

    it('takes the place the server sent for a pair key', () => {
        expect(dmPlaceOf({ id: 'u1@u2', sid: 'S9' })).toBe('S9');
        expect(dmPlaceOf({ id: 'u1@u2', sid: '', $: { sid: 'S8' } } as never)).toBe('S8');
    });

    // `#` is the server's "no place".
    it('stays empty when nothing names a place', () => {
        expect(dmPlaceOf({ id: 'u1@u2', sid: '' })).toBe('');
        expect(dmPlaceOf({ id: 'u1@u2', sid: '#' })).toBe('');
        expect(dmPlaceOf(null)).toBe('');
    });
});

describe('isCloudDm', () => {
    it('is true for a 1:1 in a subscription cloud', () => {
        expect(isCloudDm(room({ stereo: 'dm' }))).toBe(true);
    });

    it('is false for a relay 1:1, a group, a self chat, a row with no cloud and an absent row', () => {
        expect(isCloudDm(room({ stereo: 'dm', cid: RELAY_CLOUD_ID }))).toBe(false);
        expect(isCloudDm(room({ stereo: 'dm', cid: '' }))).toBe(false);
        expect(isCloudDm(room({ stereo: 'private' }))).toBe(false);
        expect(isCloudDm(room({ stereo: 'self' }))).toBe(false);
        expect(isCloudDm(null)).toBe(false);
    });
});
