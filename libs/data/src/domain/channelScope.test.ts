import { isCloudWideChannel, isInPlaceList, RELAY_CLOUD_ID } from './channelScope';

const room = (over: Record<string, unknown>) => ({ stereo: 'private', cid: '1000001', sid: 'S:one', ...over }) as never;

describe('isCloudWideChannel', () => {
    it('is true for a 1:1 in a subscription cloud', () => {
        expect(isCloudWideChannel(room({ stereo: 'dm' }))).toBe(true);
    });

    // The place a 1:1 carries is where its creator stood. It is not a reason to scope the read, and
    // it must not change the answer either way.
    it('ignores whatever place that room carries', () => {
        expect(isCloudWideChannel(room({ stereo: 'dm', sid: '' }))).toBe(true);
        expect(isCloudWideChannel(room({ stereo: 'dm', sid: 'S:anything' }))).toBe(true);
    });

    // The relay's 1:1s really do live in its one place and are already listed there.
    it('is false for a relay 1:1', () => {
        expect(isCloudWideChannel(room({ stereo: 'dm', cid: RELAY_CLOUD_ID }))).toBe(false);
    });

    it('is false for a group, a self chat and an absent row', () => {
        expect(isCloudWideChannel(room({ stereo: 'private' }))).toBe(false);
        expect(isCloudWideChannel(room({ stereo: 'self' }))).toBe(false);
        expect(isCloudWideChannel(null)).toBe(false);
        expect(isCloudWideChannel(undefined)).toBe(false);
    });
});

describe('isInPlaceList', () => {
    it('keeps a group in its own place and out of every other', () => {
        expect(isInPlaceList(room({ sid: 'S:one' }), 'S:one')).toBe(true);
        expect(isInPlaceList(room({ sid: 'S:one' }), 'S:two')).toBe(false);
    });

    it('keeps a relay 1:1 in the relay place it lives in', () => {
        expect(isInPlaceList(room({ stereo: 'dm', cid: RELAY_CLOUD_ID, sid: '0000' }), '0000')).toBe(true);
    });

    // Without this a cloud 1:1 shows twice — under whichever place its creator was in, and again in
    // the section that exists to hold it.
    it('keeps a cloud 1:1 out of every place list, including the one it is tagged with', () => {
        expect(isInPlaceList(room({ stereo: 'dm', sid: 'S:creator-was-here' }), 'S:creator-was-here')).toBe(false);
        expect(isInPlaceList(room({ stereo: 'dm', sid: 'S:creator-was-here' }), 'S:elsewhere')).toBe(false);
    });
});
