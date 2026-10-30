import {
    clearRefusedChannel,
    clearRefusedChannels,
    isChannelRefused,
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

    // The membership behind a refusal can come back — accepting a re-invite restores the join — so
    // a remembered "no" has to be retired by the channel answering, not survive the session.
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

    // useSyncExternalStore re-reads on notification, so a notification that says nothing changed is
    // a wasted render on every screen subscribed to this.
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
});
