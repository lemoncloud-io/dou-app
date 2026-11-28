import { join } from 'node:path';

import { WAKE_TICK_MS, createNodePushHost } from './nodeHost';

describe('createNodePushHost', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('keeps the credentials in the profile node folder', () => {
        expect(createNodePushHost('/p').host.credentialsPath).toBe(join('/p', 'node', 'fcm.json'));
    });

    it('reconnects when the clock jumps past two ticks, as after a sleep, and stops when disposed', () => {
        let now = 0;
        const node = createNodePushHost('/p', () => now);
        const reconnect = jest.fn();
        node.host.onWake?.(reconnect);

        now += WAKE_TICK_MS;
        jest.advanceTimersByTime(WAKE_TICK_MS);
        expect(reconnect).not.toHaveBeenCalled();

        now += 10 * 60_000;
        jest.advanceTimersByTime(WAKE_TICK_MS);
        expect(reconnect).toHaveBeenCalledTimes(1);

        node.dispose();
        now += 10 * 60_000;
        jest.advanceTimersByTime(WAKE_TICK_MS * 3);
        expect(reconnect).toHaveBeenCalledTimes(1);
    });
});
