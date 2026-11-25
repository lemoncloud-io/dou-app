import type { PendingReportInfo } from '@chatic/bridge-messages';

const mockIsNative = jest.fn(() => true);
const mockIngestLogEntry = jest.fn();

jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        get diagnostics() {
            return {
                ...testing.browserDiagnostics(),
                ...(mockIsNative()
                    ? {
                          kind: 'shell',
                          pendingReports: {
                              fetch: () => mockFetchPendingReports(),
                              ack: (ids: string[]) => mockAckPendingReports(ids),
                          },
                      }
                    : {}),
            };
        },
    });
});

jest.mock('@chatic/bridges', () => ({
    ingestLogEntry: (...args: unknown[]) => mockIngestLogEntry(...args),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFetchPendingReports = jest.fn();
const mockAckPendingReports = jest.fn().mockResolvedValue(undefined);

import { schedulePendingReportFlush } from './pendingReportFlusher';

const report = (overrides: Partial<PendingReportInfo> & { logs?: unknown[] }): PendingReportInfo => ({
    id: 'r-1',
    category: 'webview-crash',
    detectedAt: 1_000,
    ...overrides,
});

const flushNow = async (): Promise<void> => {
    schedulePendingReportFlush();
    jest.advanceTimersByTime(3_000);
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
        mockFetchPendingReports.mockResolvedValue([
            report({
                id: 'a',
                category: 'native-error',
                message: 'boom',
                stack: 'Error: boom\n  at native',
                detectedAt: 42,
                logs: [{ tag: 'APP', message: 'crumb', timestamp: 1, level: 'info' }],
            }),
        ]);

        await flushNow();

        expect(mockIngestLogEntry).toHaveBeenCalledTimes(1);
        const [entry] = mockIngestLogEntry.mock.calls[0];
        expect(entry).toMatchObject({
            level: 'error',
            tag: 'GLOBAL',
            message: '[native-error] boom',
            source: 'native',
            timestamp: 42,
        });
        expect(entry.error.stack).toBe('Error: boom\n  at native');
        expect(entry).not.toHaveProperty('logs');
        expect(mockAckPendingReports).toHaveBeenCalledWith(['a']);
    });

    it('허용 목록 밖 카테고리는 unknown으로 강등한다', async () => {
        mockFetchPendingReports.mockResolvedValue([report({ id: 'x', category: 'made-up', message: 'huh' })]);

        await flushNow();

        expect(mockIngestLogEntry.mock.calls[0][0].message).toBe('[unknown] huh');
    });

    it('현재 런의 컨텍스트를 덧씌우지 않는다', async () => {
        mockFetchPendingReports.mockResolvedValue([report({ id: 'a' })]);

        await flushNow();

        const [entry] = mockIngestLogEntry.mock.calls[0];
        expect(entry.runId).toBeUndefined();
        expect(entry.uid).toBeUndefined();
        expect(entry.cid).toBeUndefined();
    });

    it('대리 전송이 실패한 항목은 ack하지 않는다 (다음 부팅 재시도)', async () => {
        mockFetchPendingReports.mockResolvedValue([
            report({ id: 'ok' }),
            report({ id: 'fail', category: 'native-crash' }),
        ]);
        mockIngestLogEntry
            .mockImplementationOnce(() => undefined)
            .mockImplementationOnce(() => {
                throw new Error('ingest failed');
            });

        await flushNow();

        expect(mockAckPendingReports).toHaveBeenCalledWith(['ok']);
    });

    it('빈 큐면 전송도 ack도 하지 않는다', async () => {
        mockFetchPendingReports.mockResolvedValue([]);

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
