import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';
import type { PerfTraceBackend } from '@chatic/perf';
import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionCommands } from '@chatic/runtime-core/testing/sessionCommands';

import { initAppRuntime, resetRuntimeEngine } from '../../../../init';
import { useSwitchCloudSession } from './useSwitchCloudSession';

const switchCloud = jest.fn(async (_cloudId: string, _options?: unknown) => undefined);

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
};

const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

describe('useSwitchCloudSession', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetPerfTraces();
        initAppRuntime({ ...coreEngine, commands: fakeSessionCommands({ switchCloud }) });
    });

    afterEach(() => {
        resetPerfTraces();
        resetRuntimeEngine();
    });

    it("switches through the engine's command and resolves with nothing", async () => {
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await expect(result.current.switchCloud('cloud-1')).resolves.toBeUndefined();
        expect(switchCloud).toHaveBeenCalledWith('cloud-1', undefined);
    });

    it('hands the command the invite login the entry follows', async () => {
        const inviteLogin = { handle: 'invite-login-1', cloudId: 'aws-1', backend: 'https://cloud' };
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await result.current.switchCloud('cloud-1', { inviteLogin });

        expect(switchCloud).toHaveBeenCalledWith('cloud-1', { inviteLogin });
    });

    it('rethrows what the command throws', async () => {
        switchCloud.mockRejectedValueOnce(Object.assign(new Error('unknown handle'), { code: 'INVITE_LOGIN_UNKNOWN' }));
        const { result } = renderHook(() => useSwitchCloudSession(), { wrapper: createWrapper() });

        await expect(result.current.switchCloud('cloud-1')).rejects.toMatchObject({ code: 'INVITE_LOGIN_UNKNOWN' });
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
        switchCloud.mockRejectedValueOnce(new Error('exchange failed'));

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
