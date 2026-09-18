import { logger } from '@chatic/bridges';
import { getNativeCacheMetrics, recordNativeCacheOperation, resetNativeCacheMetrics } from './nativeCacheMetrics';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const warn = logger.warn as jest.Mock;
const info = logger.info as jest.Mock;

beforeEach(() => {
    resetNativeCacheMetrics();
    jest.clearAllMocks();
});

describe('recordNativeCacheOperation', () => {
    it('연산·타입별로 횟수와 평균·최대를 누적한다', () => {
        recordNativeCacheOperation('loadAll', 'chat', 10);
        recordNativeCacheOperation('loadAll', 'chat', 20);
        recordNativeCacheOperation('load', 'channel', 4);

        const { totalOps, operations } = getNativeCacheMetrics();

        expect(totalOps).toBe(3);
        expect(operations['loadAll:chat']).toEqual({ count: 2, avgMs: 15, maxMs: 20 });
        expect(operations['load:channel']).toEqual({ count: 1, avgMs: 4, maxMs: 4 });
    });

    // Logging every call would quickly push the ring buffer (500) out, so only slow calls are kept.
    it('임계치 미만은 로그를 남기지 않는다', () => {
        recordNativeCacheOperation('load', 'chat', 49);

        expect(warn).not.toHaveBeenCalled();
    });

    it('임계치 이상이면 경고로 남긴다', () => {
        recordNativeCacheOperation('loadAll', 'chat', 120);

        expect(warn).toHaveBeenCalledTimes(1);
        const [, message, meta] = warn.mock.calls[0];
        expect(message).toContain('slow loadAll chat 120ms');
        expect(meta.data).toMatchObject({ operation: 'loadAll', type: 'chat', elapsedMs: 120 });
    });

    // A guard so instrumentation doesn't inflate the very congestion it's trying to measure. On
    // native, one log entry is one bridge round trip, and once congestion starts, every call
    // crosses the threshold — so a threshold alone would attach one extra log round trip to
    // every cache request.
    it('같은 연산·타입의 느린 호출이 이어져도 스로틀 간격 안에서는 한 줄만 남긴다', () => {
        for (let i = 0; i < 50; i += 1) recordNativeCacheOperation('loadAll', 'chat', 200);

        expect(warn).toHaveBeenCalledTimes(1);
        // Even though the log is collapsed, the cumulative stats keep every one — the distribution is read from here.
        expect(getNativeCacheMetrics().operations['loadAll:chat'].count).toBe(50);
    });

    it('스로틀은 연산·타입별로 따로 적용된다', () => {
        recordNativeCacheOperation('loadAll', 'chat', 200);
        recordNativeCacheOperation('loadAll', 'channel', 200);
        recordNativeCacheOperation('load', 'chat', 200);

        expect(warn).toHaveBeenCalledTimes(3);
    });

    it('스로틀 간격이 지나면 다시 남긴다', () => {
        const nowSpy = jest.spyOn(Date, 'now');
        nowSpy.mockReturnValue(1_000);
        recordNativeCacheOperation('loadAll', 'chat', 200);
        recordNativeCacheOperation('loadAll', 'chat', 200);
        expect(warn).toHaveBeenCalledTimes(1);

        nowSpy.mockReturnValue(1_000 + 3_000);
        recordNativeCacheOperation('loadAll', 'chat', 200);
        expect(warn).toHaveBeenCalledTimes(2);

        nowSpy.mockRestore();
    });

    // Even with zero slow calls, "how often is this called" still needs to be visible — a high
    // call count calls for a different remedy even when latency is low (the observer
    // re-fetching pattern).
    it('100회마다 누적 요약을 남긴다', () => {
        for (let i = 0; i < 99; i += 1) recordNativeCacheOperation('load', 'chat', 1);
        expect(info).not.toHaveBeenCalled();

        recordNativeCacheOperation('load', 'chat', 1);

        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0][2].data).toMatchObject({ totalOps: 100 });
    });
});
