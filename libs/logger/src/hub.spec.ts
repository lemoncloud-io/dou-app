import { createLogHub } from './hub';
import type { LogEntry } from './types';

const entryOf = (message: string): LogEntry => ({
    level: 'info',
    tag: 'TEST',
    message,
    timestamp: 1,
});

describe('createLogHub', () => {
    it('publish된 엔트리를 모든 구독자에게 전달한다', () => {
        const hub = createLogHub();
        const first = jest.fn();
        const second = jest.fn();
        hub.subscribe(first);
        hub.subscribe(second);

        const entry = entryOf('hello');
        hub.publish(entry);

        expect(first).toHaveBeenCalledWith(entry);
        expect(second).toHaveBeenCalledWith(entry);
    });

    it('unsubscribe 이후에는 엔트리를 받지 않는다', () => {
        const hub = createLogHub();
        const listener = jest.fn();
        const unsubscribe = hub.subscribe(listener);

        unsubscribe();
        hub.publish(entryOf('after'));

        expect(listener).not.toHaveBeenCalled();
        expect(hub.size()).toBe(0);
    });

    it('한 구독자가 던져도 다른 구독자는 계속 받는다', () => {
        const hub = createLogHub();
        const broken = jest.fn(() => {
            throw new Error('sink failure');
        });
        const healthy = jest.fn();
        hub.subscribe(broken);
        hub.subscribe(healthy);

        expect(() => hub.publish(entryOf('isolated'))).not.toThrow();
        expect(healthy).toHaveBeenCalledTimes(1);
    });

    it('size는 현재 구독자 수를 반환한다', () => {
        const hub = createLogHub();
        expect(hub.size()).toBe(0);

        const unsubscribe = hub.subscribe(jest.fn());
        hub.subscribe(jest.fn());
        expect(hub.size()).toBe(2);

        unsubscribe();
        expect(hub.size()).toBe(1);
    });
});
