import { logger } from '@chatic/bridges';

import { getLogQueueView } from './logQueueView';
import { queueLossObserver } from './queueLossObserver';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('./logQueueView', () => ({ getLogQueueView: jest.fn() }));

const warn = logger.warn as jest.Mock;
const getView = getLogQueueView as jest.Mock;

const viewWith = (droppedCount: number) => ({
    snapshot: () => [],
    clear: () => undefined,
    droppedCount: () => droppedCount,
});

beforeEach(() => {
    jest.clearAllMocks();
    queueLossObserver.reset();
});

describe('queueLossObserver — 미전송 큐 유실 관측', () => {
    it('자란 만큼을 warn으로 남긴다', () => {
        getView.mockReturnValue(viewWith(7));

        queueLossObserver.observe();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('LOG_BUFFER');
        expect(warn.mock.calls[0][2]).toEqual({ observation: 'queue-loss', dropped: 7, droppedTotal: 7 });
    });

    it('두 번째 관측은 증가분만 남긴다', () => {
        getView.mockReturnValue(viewWith(7));
        queueLossObserver.observe();
        warn.mockClear();

        getView.mockReturnValue(viewWith(10));
        queueLossObserver.observe();

        expect(warn.mock.calls[0][2]).toEqual({ observation: 'queue-loss', dropped: 3, droppedTotal: 10 });
    });

    it('안 자랐으면 아무것도 남기지 않는다', () => {
        getView.mockReturnValue(viewWith(7));
        queueLossObserver.observe();
        warn.mockClear();

        queueLossObserver.observe();
        queueLossObserver.observe();

        expect(warn).not.toHaveBeenCalled();
    });

    it('유실이 0이면 침묵한다', () => {
        getView.mockReturnValue(viewWith(0));

        queueLossObserver.observe();

        expect(warn).not.toHaveBeenCalled();
    });

    it('업로더가 없으면 무해하게 지나간다', () => {
        getView.mockReturnValue(undefined);

        expect(() => queueLossObserver.observe()).not.toThrow();
        expect(warn).not.toHaveBeenCalled();
    });

    it('카운터가 줄어들면 새 기준선으로 삼고 남기지 않는다', () => {
        getView.mockReturnValue(viewWith(10));
        queueLossObserver.observe();
        warn.mockClear();

        getView.mockReturnValue(viewWith(2));
        queueLossObserver.observe();
        expect(warn).not.toHaveBeenCalled();

        getView.mockReturnValue(viewWith(5));
        queueLossObserver.observe();
        expect(warn.mock.calls[0][2]).toEqual({ observation: 'queue-loss', dropped: 3, droppedTotal: 5 });
    });
});
