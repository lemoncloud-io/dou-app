import { logger } from '@chatic/bridges';

import { syncStreakReporter } from './syncStreakReporter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const warn = logger.warn as jest.Mock;
const error = logger.error as jest.Mock;
const info = logger.info as jest.Mock;

const boom = new Error('sync boom');

beforeEach(() => {
    jest.clearAllMocks();
    syncStreakReporter.reset();
});

describe('syncStreakReporter — 배경 동기화 실패 스트릭', () => {
    it('첫 실패는 warn 한 건이다', () => {
        syncStreakReporter.fail('channel-delta', boom);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('SYNC');
        expect(warn.mock.calls[0][2]).toMatchObject({
            data: { observation: 'sync-streak', path: 'channel-delta', streak: 1 },
        });
        expect(error).not.toHaveBeenCalled();
    });

    // 2연속은 아직 흔한 일시 실패 구간이다 — 임계에서만 승격한다.
    it('임계(3연속)에 닿을 때 error 한 건을 남긴다', () => {
        syncStreakReporter.fail('channel-delta', boom);
        syncStreakReporter.fail('channel-delta', boom);
        expect(error).not.toHaveBeenCalled();

        syncStreakReporter.fail('channel-delta', boom);

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][2]).toMatchObject({
            data: { observation: 'sync-streak', path: 'channel-delta', streak: 3 },
        });
    });

    // 같은 사실을 매 주기 반복하면 하루 수천 건이 되고 정작 그 사실이 묻힌다.
    it('임계를 넘긴 뒤로는 침묵한다', () => {
        for (let i = 0; i < 10; i += 1) syncStreakReporter.fail('channel-delta', boom);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('복구는 몇 연속 실패 뒤였는지와 함께 info로 남긴다', () => {
        syncStreakReporter.fail('profile-delta', boom);
        syncStreakReporter.fail('profile-delta', boom);

        syncStreakReporter.succeed('profile-delta');

        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0][0]).toBe('SYNC');
        expect(info.mock.calls[0][2]).toEqual({
            observation: 'sync-streak',
            path: 'profile-delta',
            afterFailures: 2,
        });
    });

    it('실패한 적 없는 경로의 성공은 아무것도 남기지 않는다', () => {
        syncStreakReporter.succeed('profile-delta');
        syncStreakReporter.succeed('profile-delta');

        expect(info).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('복구 뒤 다시 실패하면 첫 실패부터 다시 센다', () => {
        syncStreakReporter.fail('my-profile', boom);
        syncStreakReporter.succeed('my-profile');
        warn.mockClear();

        syncStreakReporter.fail('my-profile', boom);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][2]).toMatchObject({ data: { streak: 1 } });
    });

    // 한 경로가 죽고 나머지가 사는 상태가 실제로 있다 — 합쳐 세면 그 구분이 사라진다.
    it('경로별로 따로 센다', () => {
        syncStreakReporter.fail('channel-delta', boom);
        syncStreakReporter.fail('channel-delta', boom);
        syncStreakReporter.fail('profile-delta', boom);

        syncStreakReporter.fail('channel-delta', boom);

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][2]).toMatchObject({ data: { path: 'channel-delta' } });
    });
});
