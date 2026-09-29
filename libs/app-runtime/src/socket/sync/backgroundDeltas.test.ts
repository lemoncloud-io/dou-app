import { logger } from '@chatic/bridges';

import { emitBackgroundDelta, subscribeBackgroundDeltas } from './backgroundDeltas';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('backgroundDeltas', () => {
    it('tells every subscriber, and nobody after they unsubscribe', () => {
        const first = jest.fn();
        const second = jest.fn();
        const offFirst = subscribeBackgroundDeltas(first);
        const offSecond = subscribeBackgroundDeltas(second);

        emitBackgroundDelta({ cid: 'cloud-a', requestedAt: 1 });
        offFirst();
        emitBackgroundDelta({ cid: 'cloud-a', requestedAt: 2 });
        offSecond();

        expect(first.mock.calls).toEqual([[{ cid: 'cloud-a', requestedAt: 1 }]]);
        expect(second.mock.calls).toEqual([[{ cid: 'cloud-a', requestedAt: 1 }], [{ cid: 'cloud-a', requestedAt: 2 }]]);
    });

    it('a subscriber that throws is reported and does not keep the others from hearing', () => {
        const offThrowing = subscribeBackgroundDeltas(() => {
            throw new Error('app bug');
        });
        const listener = jest.fn();
        const off = subscribeBackgroundDeltas(listener);

        expect(() => emitBackgroundDelta({ cid: 'cloud-a', requestedAt: 1 })).not.toThrow();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith('SYNC', '[backgroundDeltas] a listener threw', expect.anything());

        offThrowing();
        off();
    });
});
