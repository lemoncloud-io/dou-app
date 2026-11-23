import {
    clearRefusedChannel,
    clearRefusedChannels,
    isChannelRefused,
    listRefusedChannels,
    recordRefusedChannel,
    subscribeRefusedChannels,
} from './refusedChannels';

describe('refusedChannels', () => {
    afterEach(() => clearRefusedChannels());

    it('기억한 거절만 답한다', () => {
        recordRefusedChannel('ch-1');

        expect(isChannelRefused('ch-1')).toBe(true);
        expect(isChannelRefused('ch-2')).toBe(false);
    });

    it('채널이 다시 응답하면 거절을 잊는다', () => {
        recordRefusedChannel('ch-1');
        clearRefusedChannel('ch-1');

        expect(isChannelRefused('ch-1')).toBe(false);
    });

    it('계정이 바뀌면 전부 잊는다 — 다른 사람에게 들은 말이다', () => {
        recordRefusedChannel('ch-1');
        recordRefusedChannel('ch-2');

        clearRefusedChannels();

        expect(isChannelRefused('ch-1')).toBe(false);
        expect(isChannelRefused('ch-2')).toBe(false);
    });

    it('상태가 실제로 바뀔 때만 알린다', () => {
        const listener = jest.fn();
        const unsubscribe = subscribeRefusedChannels(listener);

        recordRefusedChannel('ch-1');
        recordRefusedChannel('ch-1');
        clearRefusedChannel('ch-2');

        expect(listener).toHaveBeenCalledTimes(1);

        clearRefusedChannel('ch-1');
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        recordRefusedChannel('ch-3');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('lists the refused rooms as the same array until the set changes', () => {
        recordRefusedChannel('ch-a');
        const first = listRefusedChannels();

        expect(listRefusedChannels()).toBe(first);
        expect(first).toEqual(['ch-a']);

        recordRefusedChannel('ch-b');
        expect(listRefusedChannels()).not.toBe(first);
        expect(listRefusedChannels()).toEqual(['ch-a', 'ch-b']);
    });
});
