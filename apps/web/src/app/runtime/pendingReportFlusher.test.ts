import type { PendingReportInfo } from '@chatic/app-messages';

const mockIsNative = jest.fn(() => true);
const mockIngestLogEntry = jest.fn();

jest.mock('@chatic/bridges', () => ({
    isNative: () => mockIsNative(),
    ingestLogEntry: (...args: unknown[]) => mockIngestLogEntry(...args),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFetchPendingReports = jest.fn();
const mockAckPendingReports = jest.fn().mockResolvedValue({ success: true, data: { size: 0 } });
jest.mock('../bridge', () => ({
    appBridge: {
        fetchPendingReports: () => mockFetchPendingReports(),
        ackPendingReports: (ids: string[]) => mockAckPendingReports(ids),
    },
}));

import { schedulePendingReportFlush } from './pendingReportFlusher';

const report = (overrides: Partial<PendingReportInfo>): PendingReportInfo => ({
    id: 'r-1',
    category: 'webview-crash',
    detectedAt: 1_000,
    ...overrides,
});

const flushNow = async (): Promise<void> => {
    schedulePendingReportFlush();
    jest.advanceTimersByTime(3_000);
    // Drain the async flush chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

describe('schedulePendingReportFlush', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockIsNative.mockReturnValue(true);
        mockIngestLogEntry.mockReset();
        mockFetchPendingReports.mockReset();
        mockAckPendingReports.mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('큐의 리포트를 감지 시각 그대로 로그 엔트리로 합류시키고 ack한다', async () => {
        mockFetchPendingReports.mockResolvedValue({
            success: true,
            data: {
                reports: [
                    report({
                        id: 'a',
                        category: 'native-error',
                        message: 'boom',
                        stack: 'Error: boom\n  at native',
                        detectedAt: 42,
                        logs: [{ tag: 'APP', message: 'crumb', timestamp: 1, level: 'info' }],
                    }),
                ],
            },
        });

        await flushNow();

        expect(mockIngestLogEntry).toHaveBeenCalledTimes(1);
        const [entry] = mockIngestLogEntry.mock.calls[0];
        expect(entry).toMatchObject({
            level: 'error',
            tag: 'GLOBAL',
            message: '[native-error] boom',
            source: 'native',
            // The whole reason this uses `ingest` and not `logger.error`: the crash
            // happened in a run that is already gone, so dispatch-time stamping
            // would date it to this boot.
            timestamp: 42,
        });
        expect(entry.error.stack).toBe('Error: boom\n  at native');
        // 구버전 셸은 계속 스냅샷을 실어 보내지만 대리 전송은 그걸 옮기지 않는다 —
        // 같은 엔트리를 업로더가 이미 낱건으로 올린다.
        expect(entry).not.toHaveProperty('logs');
        expect(mockAckPendingReports).toHaveBeenCalledWith(['a']);
    });

    it('허용 목록 밖 카테고리는 unknown으로 강등한다', async () => {
        mockFetchPendingReports.mockResolvedValue({
            success: true,
            data: { reports: [report({ id: 'x', category: 'made-up', message: 'huh' })] },
        });

        await flushNow();

        expect(mockIngestLogEntry.mock.calls[0][0].message).toBe('[unknown] huh');
    });

    it('현재 런의 컨텍스트를 덧씌우지 않는다', async () => {
        mockFetchPendingReports.mockResolvedValue({
            success: true,
            data: { reports: [report({ id: 'a' })] },
        });

        await flushNow();

        // A wrong `runId` is worse than a missing one — it folds a dead run's
        // crash into this one.
        const [entry] = mockIngestLogEntry.mock.calls[0];
        expect(entry.runId).toBeUndefined();
        expect(entry.uid).toBeUndefined();
        expect(entry.cid).toBeUndefined();
    });

    it('대리 전송이 실패한 항목은 ack하지 않는다 (다음 부팅 재시도)', async () => {
        mockFetchPendingReports.mockResolvedValue({
            success: true,
            data: { reports: [report({ id: 'ok' }), report({ id: 'fail', category: 'native-crash' })] },
        });
        mockIngestLogEntry
            .mockImplementationOnce(() => undefined)
            .mockImplementationOnce(() => {
                throw new Error('ingest failed');
            });

        await flushNow();

        expect(mockAckPendingReports).toHaveBeenCalledWith(['ok']);
    });

    it('빈 큐면 전송도 ack도 하지 않는다', async () => {
        mockFetchPendingReports.mockResolvedValue({ success: true, data: { reports: [] } });

        await flushNow();

        expect(mockIngestLogEntry).not.toHaveBeenCalled();
        expect(mockAckPendingReports).not.toHaveBeenCalled();
    });

    it('웹 단독 실행이면 아무것도 하지 않는다', async () => {
        mockIsNative.mockReturnValue(false);

        await flushNow();

        expect(mockFetchPendingReports).not.toHaveBeenCalled();
    });
});
