import { renderHook } from '@testing-library/react';

import { usePerfHandler } from './usePerfHandler';
import { bootMetricsService } from '../../services';

jest.mock('../../services', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    bootMetricsService: {
        attachWebMetrics: jest.fn(),
        getRecords: jest.fn(),
        clearRecords: jest.fn(),
        getContentProcessReloadCount: jest.fn(() => 0),
        getLastForegroundResumeMs: jest.fn(() => null),
    },
}));

jest.mock('../../stores', () => ({
    useDebugSettingsStore: (selector: (s: any) => unknown) => selector({ setDebugModeEnabled: jest.fn() }),
}));

const mocked = bootMetricsService as jest.Mocked<typeof bootMetricsService>;

const record = () => ({
    finalizedAt: 1_700_000_000_000,
    type: 'cold' as const,
    appVersion: '0.24.0',
    native: { 'provider-ready': 12, 'web-app-ready': 980 },
    web: null,
    totalMs: 980,
});

describe('usePerfHandler — 부팅 기록 읽기/비우기 (ADR-0080 결정 11)', () => {
    beforeEach(() => jest.clearAllMocks());

    // 이 명령이 존재하는 이유가 이것이다 — SendBootMetrics는 웹→앱 쓰기뿐이라
    // 병합된 기록을 되읽을 경로가 없었다.
    it('handleFetchBootRecords는 기록과 두 카운터를 함께 돌려준다', async () => {
        mocked.getRecords.mockResolvedValue([record()]);
        mocked.getContentProcessReloadCount.mockReturnValue(2);
        mocked.getLastForegroundResumeMs.mockReturnValue(1_699_999_000_000);
        const { result } = renderHook(() => usePerfHandler());

        const response = await result.current.handleFetchBootRecords({ type: 'FetchBootRecords', data: {} } as never);

        expect(response).toEqual({
            type: 'OnFetchBootRecords',
            success: true,
            data: {
                records: [record()],
                contentProcessReloadCount: 2,
                lastForegroundResumeMs: 1_699_999_000_000,
            },
        });
    });

    it('기록이 없으면 빈 배열을 돌려준다 — 실패가 아니다', async () => {
        mocked.getRecords.mockResolvedValue([]);
        const { result } = renderHook(() => usePerfHandler());

        const response = await result.current.handleFetchBootRecords({ type: 'FetchBootRecords', data: {} } as never);

        expect(response).toMatchObject({ success: true, data: { records: [] } });
    });

    it('읽기가 실패하면 에러 응답을 돌려준다 — 조용히 빈 화면을 만들지 않는다', async () => {
        mocked.getRecords.mockRejectedValue(new Error('storage down'));
        const { result } = renderHook(() => usePerfHandler());

        const response = await result.current.handleFetchBootRecords({ type: 'FetchBootRecords', data: {} } as never);

        expect(response).toMatchObject({
            type: 'OnFetchBootRecords',
            success: false,
            error: { code: 'BOOT_RECORDS_ERROR' },
        });
    });

    it('handleClearBootRecords는 기록을 지우고 성공을 알린다', async () => {
        mocked.clearRecords.mockResolvedValue(undefined);
        const { result } = renderHook(() => usePerfHandler());

        const response = await result.current.handleClearBootRecords({ type: 'ClearBootRecords', data: {} } as never);

        expect(mocked.clearRecords).toHaveBeenCalledTimes(1);
        expect(response).toEqual({ type: 'OnClearBootRecords', success: true, data: { success: true } });
    });

    it('비우기가 실패하면 에러 응답을 돌려준다', async () => {
        mocked.clearRecords.mockRejectedValue(new Error('storage down'));
        const { result } = renderHook(() => usePerfHandler());

        const response = await result.current.handleClearBootRecords({ type: 'ClearBootRecords', data: {} } as never);

        expect(response).toMatchObject({ success: false, error: { code: 'BOOT_RECORDS_ERROR' } });
    });
});
