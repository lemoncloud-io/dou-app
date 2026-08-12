import type { PendingReportInfo } from '@chatic/app-messages';

const mockIsNative = jest.fn(() => true);

jest.mock('@chatic/bridges', () => ({
    isNative: () => mockIsNative(),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockReportError = jest.fn().mockResolvedValue(undefined);
jest.mock('@chatic/web-core', () => ({
    reportError: (...args: unknown[]) => mockReportError(...args),
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
        mockReportError.mockClear().mockResolvedValue(undefined);
        mockFetchPendingReports.mockReset();
        mockAckPendingReports.mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('큐의 리포트를 categoryOverride·감지 시각·스냅샷 breadcrumb으로 대리 전송하고 ack한다', async () => {
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

        expect(mockReportError).toHaveBeenCalledTimes(1);
        const [error, context] = mockReportError.mock.calls[0];
        expect(error.message).toBe('boom');
        expect(error.stack).toBe('Error: boom\n  at native');
        expect(context).toMatchObject({
            source: 'pending-report',
            categoryOverride: 'native-error',
            occurredAt: 42,
        });
        expect(context.logsOverride).toEqual([{ level: 'info', tag: 'APP', message: 'crumb', timestamp: 1 }]);
        expect(mockAckPendingReports).toHaveBeenCalledWith(['a']);
    });

    it('허용 목록 밖 카테고리는 unknown으로 강등한다', async () => {
        mockFetchPendingReports.mockResolvedValue({
            success: true,
            data: { reports: [report({ id: 'x', category: 'made-up' })] },
        });

        await flushNow();

        expect(mockReportError.mock.calls[0][1].categoryOverride).toBe('unknown');
    });

    it('대리 전송이 실패한 항목은 ack하지 않는다 (다음 부팅 재시도)', async () => {
        mockFetchPendingReports.mockResolvedValue({
            success: true,
            data: { reports: [report({ id: 'ok' }), report({ id: 'fail', category: 'native-crash' })] },
        });
        mockReportError.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('sign failed'));

        await flushNow();

        expect(mockAckPendingReports).toHaveBeenCalledWith(['ok']);
    });

    it('빈 큐면 전송도 ack도 하지 않는다', async () => {
        mockFetchPendingReports.mockResolvedValue({ success: true, data: { reports: [] } });

        await flushNow();

        expect(mockReportError).not.toHaveBeenCalled();
        expect(mockAckPendingReports).not.toHaveBeenCalled();
    });

    it('웹 단독 실행이면 아무것도 하지 않는다', async () => {
        mockIsNative.mockReturnValue(false);

        await flushNow();

        expect(mockFetchPendingReports).not.toHaveBeenCalled();
    });
});
