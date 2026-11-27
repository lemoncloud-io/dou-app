import { channelIdOfChatId } from './chatId';

describe('channelIdOfChatId', () => {
    it('takes the channel from a place-keyed 1:1 chat id', () => {
        expect(channelIdOfChatId('1000008@u1@u2:7')).toBe('1000008@u1@u2');
    });

    it('cuts at the last colon, so a channel id holding one stays whole', () => {
        expect(channelIdOfChatId('S:one:42')).toBe('S:one');
    });

    it('returns an id with no colon as it is', () => {
        expect(channelIdOfChatId('ch-1')).toBe('ch-1');
    });
});
