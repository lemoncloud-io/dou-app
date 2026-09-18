import { logger } from '../runtime';
import { foreignDropAggregator } from './foreignDropAggregator';

jest.mock('../runtime', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const warn = logger.warn as jest.Mock;
const drop = (source: 'sync-frame' | 'channel-refresh' = 'sync-frame', cid = 'cloud_b', socketCid = 'cloud_a') =>
    foreignDropAggregator.record({ source, cid, socketCid });

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    foreignDropAggregator.reset();
});

afterEach(() => {
    foreignDropAggregator.reset();
    jest.useRealTimers();
});

describe('foreignDropAggregator — 외래 클라우드 드롭 집계', () => {
    // A spot where dozens can arrive at once, riding a 2-second poll per target — the catalog forbids logging them individually.
    it('창이 닫힐 때까지 아무것도 남기지 않는다', () => {
        drop();
        drop();
        drop();

        expect(warn).not.toHaveBeenCalled();
    });

    it('창이 닫히면 건수를 한 줄로 남긴다', () => {
        drop();
        drop();
        drop();

        jest.advanceTimersByTime(5_000);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('CACHE');
        expect(warn.mock.calls[0][2]).toEqual({
            observation: 'foreign-drop',
            source: 'sync-frame',
            cid: 'cloud_b',
            socketCid: 'cloud_a',
            count: 3,
        });
    });

    it('지점·클라우드 조합이 다르면 따로 센다', () => {
        drop('sync-frame');
        drop('channel-refresh');
        drop('sync-frame');

        jest.advanceTimersByTime(5_000);

        expect(warn).toHaveBeenCalledTimes(2);
        const counts = warn.mock.calls.map(call => [call[2].source, call[2].count]);
        expect(counts).toEqual(
            expect.arrayContaining([
                ['sync-frame', 2],
                ['channel-refresh', 1],
            ])
        );
    });

    it('창이 닫힌 뒤 상태를 비운다 — 다음 창이 이전 건수를 물려받지 않는다', () => {
        drop();
        jest.advanceTimersByTime(5_000);
        warn.mockClear();

        drop();
        jest.advanceTimersByTime(5_000);

        expect(warn.mock.calls[0][2].count).toBe(1);
    });

    // With no drops there should be no timer at all — no cost left running on an idle device.
    it('드롭이 없으면 시간이 흘러도 아무것도 남기지 않는다', () => {
        jest.advanceTimersByTime(60_000);

        expect(warn).not.toHaveBeenCalled();
    });

    it('창이 열려 있는 동안 도착한 드롭은 같은 창에 합쳐진다', () => {
        drop();
        jest.advanceTimersByTime(4_000);
        drop();

        jest.advanceTimersByTime(1_000);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][2].count).toBe(2);
    });
});
