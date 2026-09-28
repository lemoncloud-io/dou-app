import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';

import type { PerfTraceBackend } from '@chatic/perf';

const mockSwitchCloudSession = jest.fn();

jest.mock('../../../auth/cloudSession', () => ({
    cloudSession: { switchTo: (...args: unknown[]) => mockSwitchCloudSession(...args) },
}));

const mockSlotKeys = jest.fn((): string[] => []);
jest.mock('../../../../socket/runtime', () => ({
    getSocketManager: () => ({ getSlotKeys: () => mockSlotKeys() }),
}));

const mockTimeToExpiry = jest.fn((): number | null => 60 * 60_000);
const mockRenew = jest.fn(async () => true);
jest.mock('../../../../socket/auth/renewers', () => ({
    credentialRenewers: { forSlot: () => ({ timeToExpiry: () => mockTimeToExpiry(), renew: () => mockRenew() }) },
}));

const { useSwitchCloudSession } = require('./useSwitchCloudSession');

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
};

const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

describe('useSwitchCloudSession', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetPerfTraces();
        mockSwitchCloudSession.mockResolvedValue({ cloudId: 'cloud-1' });
        mockSlotKeys.mockReturnValue([]);
        mockTimeToExpiry.mockReturnValue(60 * 60_000);
    });

    afterEach(() => resetPerfTraces());

    it('클라우드 전환을 서비스에 위임하고 스냅샷을 돌려준다', async () => {
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await expect(result.current.switchCloud('cloud-1')).resolves.toEqual({ cloudId: 'cloud-1' });
        expect(mockSwitchCloudSession).toHaveBeenCalledWith('cloud-1', { hasLiveSlot: false });
    });

    it('tells the service when the target cloud already has a socket slot bound', async () => {
        mockSlotKeys.mockReturnValue(['default', 'cloud-1']);
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await result.current.switchCloud('cloud-1');

        expect(mockSwitchCloudSession).toHaveBeenCalledWith('cloud-1', { hasLiveSlot: true });
        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('renews at once after landing on a live slot whose token ran low — e.g. after sleep', async () => {
        mockSlotKeys.mockReturnValue(['default', 'cloud-1']);
        mockTimeToExpiry.mockReturnValue(60_000);
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await result.current.switchCloud('cloud-1');

        expect(mockRenew).toHaveBeenCalledTimes(1);
    });

    it('leaves a switch without a live slot to its own fresh exchange', async () => {
        mockTimeToExpiry.mockReturnValue(60_000);
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await result.current.switchCloud('cloud-1');

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('records a successful switch as one cloud_switch trace with outcome ok', async () => {
        configurePerfTraces(backend);

        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });
        await result.current.switchCloud('cloud-1');

        expect(backend.start).toHaveBeenCalledWith(expect.objectContaining({ name: 'cloud_switch' }));
        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'cloud_switch', attributes: { outcome: 'ok' } })
        );
    });

    it('records a failed switch with outcome error and still rethrows', async () => {
        configurePerfTraces(backend);
        mockSwitchCloudSession.mockRejectedValue(new Error('exchange failed'));

        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await expect(result.current.switchCloud('cloud-1')).rejects.toThrow('exchange failed');
        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(expect.objectContaining({ attributes: { outcome: 'error' } }));
    });

    it('records nothing on a host that never configured tracing (desktop-web, browser)', async () => {
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await result.current.switchCloud('cloud-1');

        expect(backend.start).not.toHaveBeenCalled();
        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('switchCloud 콜백은 리렌더를 건너도 같은 참조를 유지한다', () => {
        const { result, rerender } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });
        const first = result.current.switchCloud;

        rerender();

        expect(result.current.switchCloud).toBe(first);
    });
});
