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

    // 전수 로깅은 링버퍼(500)를 금방 밀어내므로 느린 호출만 남긴다.
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

    // 계측이 자기가 재려던 정체를 키우지 않게 하는 장치. 네이티브에서 로그 한 건은 브릿지 왕복 한
    // 건인데, 정체가 시작되면 모든 호출이 임계치를 넘으므로 임계치만으로는 캐시 요청마다 로그
    // 왕복이 하나씩 붙는다.
    it('같은 연산·타입의 느린 호출이 이어져도 스로틀 간격 안에서는 한 줄만 남긴다', () => {
        for (let i = 0; i < 50; i += 1) recordNativeCacheOperation('loadAll', 'chat', 200);

        expect(warn).toHaveBeenCalledTimes(1);
        // 로그는 접혔어도 누적 통계는 전수로 남는다 — 분포는 여기서 본다.
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

    // 느린 호출이 하나도 없어도 "얼마나 자주 부르는가"는 보여야 한다 — 지연이 낮아도 횟수가 많으면
    // 처방이 달라지기 때문(옵저버 재조회 패턴).
    it('100회마다 누적 요약을 남긴다', () => {
        for (let i = 0; i < 99; i += 1) recordNativeCacheOperation('load', 'chat', 1);
        expect(info).not.toHaveBeenCalled();

        recordNativeCacheOperation('load', 'chat', 1);

        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0][2].data).toMatchObject({ totalOps: 100 });
    });
});
