import { newMessageId, pushData, roomPushData } from './pushPresets';

const room = { channelId: 'ch1', cid: '#', sid: 's1' };

describe('pushData', () => {
    it('builds each kind in the server payload shape', () => {
        expect(pushData('room', { room, json: '' })).toEqual({
            type: 'chat',
            link: '/channels/ch1/room',
            payload: { cid: '#', sid: 's1', channelId: 'ch1' },
        });
        expect(pushData('cloud-ready', { room, json: '' })).toEqual({ type: 'cloud' });
        expect(pushData('custom', { room, json: '{"type":"notice","link":"/mypage"}' })).toEqual({
            type: 'notice',
            link: '/mypage',
        });
    });

    it('refuses a room with no channel, and custom JSON that is not an object', () => {
        expect(() => pushData('room', { room: { ...room, channelId: ' ' }, json: '' })).toThrow();
        expect(() => pushData('custom', { room, json: '[1]' })).toThrow();
        expect(() => pushData('custom', { room, json: '{' })).toThrow();
    });
});

describe('roomPushData', () => {
    it('marks a room with no cloud as the relay', () => {
        expect(roomPushData({ ...room, cid: '' })).toMatchObject({ payload: { cid: '#' } });
    });

    it('carries the fields the banner reads, and extra ones as typed, leaving out the empty', () => {
        expect(
            roomPushData(room, {
                channelName: 'Team',
                ownerId: '1000041',
                thumbnail: '',
                messageId: 'm1',
                extra: [
                    { key: 'chatId', value: 'c9' },
                    { key: ' ', value: 'ignored' },
                ],
            })
        ).toEqual({
            type: 'chat',
            link: '/channels/ch1/room',
            payload: {
                cid: '#',
                sid: 's1',
                channelId: 'ch1',
                channelName: 'Team',
                ownerId: '1000041',
                messageId: 'm1',
                chatId: 'c9',
            },
        });
    });

    it('can arrive as FCM delivers it: payload as a JSON string, the message id beside it', () => {
        const data = roomPushData(room, { channelName: 'Team', messageId: 'm1', asDelivered: true });

        expect(data['messageId']).toBe('m1');
        expect(JSON.parse(data['payload'] as string)).toEqual({
            cid: '#',
            sid: 's1',
            channelId: 'ch1',
            channelName: 'Team',
            messageId: 'm1',
        });
    });
});

describe('newMessageId', () => {
    it('differs from one moment to the next', () => {
        expect(newMessageId(1)).not.toBe(newMessageId(2));
    });
});
