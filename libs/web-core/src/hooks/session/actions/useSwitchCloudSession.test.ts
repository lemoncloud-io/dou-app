import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { configurePerfMetrics, resetPerfMetrics } from '@chatic/bridges';

import type { Logger } from '@chatic/bridges';

const mockSwitchCloudSession = jest.fn();

jest.mock('../../../session', () => ({
    switchCloudSession: (...args: unknown[]) => mockSwitchCloudSession(...args),
}));

const { useSwitchCloudSession } = require('./useSwitchCloudSession');

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
};

const perfLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('useSwitchCloudSession', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetPerfMetrics();
        mockSwitchCloudSession.mockResolvedValue({ cloudId: 'cloud-1' });
    });

    afterEach(() => resetPerfMetrics());

    it('클라우드 전환을 서비스에 위임하고 스냅샷을 돌려준다', async () => {
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await expect(result.current.switchCloud('cloud-1')).resolves.toEqual({ cloudId: 'cloud-1' });
        expect(mockSwitchCloudSession).toHaveBeenCalledWith({ cloudId: 'cloud-1' });
    });

    it('성공한 전환을 cloud-switch 지표 한 건으로 보고한다', async () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });

        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });
        await result.current.switchCloud('cloud-1');

        expect(perfLogger.info).toHaveBeenCalledTimes(1);
        expect(perfLogger.info).toHaveBeenCalledWith(
            'PERF',
            expect.stringMatching(/^cloud-switch \d+ms$/),
            expect.objectContaining({ metric: 'cloud-switch', budgetMs: 1000, ok: true })
        );
    });

    it('실패한 전환도 ok:false로 보고하고 에러는 그대로 던진다', async () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });
        mockSwitchCloudSession.mockRejectedValue(new Error('exchange failed'));

        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await expect(result.current.switchCloud('cloud-1')).rejects.toThrow('exchange failed');
        expect(perfLogger.info).toHaveBeenCalledTimes(1);
        expect(perfLogger.info).toHaveBeenCalledWith(
            'PERF',
            expect.any(String),
            expect.objectContaining({ metric: 'cloud-switch', ok: false })
        );
    });

    it('지표 수집이 꺼진 호스트에서는 0건이다 (desktop-web · 브라우저)', async () => {
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await result.current.switchCloud('cloud-1');

        expect(perfLogger.info).not.toHaveBeenCalled();
    });

    it('switchCloud 콜백은 리렌더를 건너도 같은 참조를 유지한다', () => {
        const { result, rerender } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });
        const first = result.current.switchCloud;

        rerender();

        expect(result.current.switchCloud).toBe(first);
    });
});
