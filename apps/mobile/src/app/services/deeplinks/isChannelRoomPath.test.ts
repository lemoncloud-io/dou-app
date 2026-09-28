import { isChannelRoomPath } from './isChannelRoomPath';

describe('isChannelRoomPath', () => {
    it('recognizes a room route, with or without a trailing slash or query', () => {
        expect(isChannelRoomPath('/channels/1000001/room')).toBe(true);
        expect(isChannelRoomPath('/channels/U:1001750/room/')).toBe(true);
        expect(isChannelRoomPath('/channels/1/room?cid=cloud_1&sid=s')).toBe(true);
    });

    it('recognizes the spec-style channel link the web normalizes to a room', () => {
        expect(isChannelRoomPath('/channel?channelId=room_123&cid=cloud_1')).toBe(true);
        expect(isChannelRoomPath('/channel?cid=cloud_1&channelId=room_123')).toBe(true);
    });

    it('rejects every other screen', () => {
        expect(isChannelRoomPath('/')).toBe(false);
        expect(isChannelRoomPath('/?provider=invite&code=x')).toBe(false);
        expect(isChannelRoomPath('/channels/1/settings')).toBe(false);
        expect(isChannelRoomPath('/channel?cid=cloud_1')).toBe(false);
    });
});
