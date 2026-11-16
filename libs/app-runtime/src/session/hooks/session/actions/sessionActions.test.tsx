import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionCommands } from '@chatic/runtime-core/testing/sessionCommands';

import { initAppRuntime, resetRuntimeEngine } from '../../../../init';
import { useLogoutCloudSession } from './useLogoutCloudSession';
import { useSessionLogout } from './useSessionLogout';
import { useSiteSwitch } from './useSiteSwitch';

const switchSite = jest.fn(async (_siteId: string) => undefined);
const logout = jest.fn(async (_options?: unknown) => undefined);
const logoutCloud = jest.fn(async () => undefined);

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        {children}
    </QueryClientProvider>
);

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, commands: fakeSessionCommands({ switchSite, logout, logoutCloud }) });
});

afterEach(() => resetRuntimeEngine());

describe("the session action hooks run the engine's commands", () => {
    it('switches places', async () => {
        const { result } = renderHook(() => useSiteSwitch(), { wrapper });

        await act(() => result.current.switchSite('site-9'));

        expect(switchSite).toHaveBeenCalledWith('site-9');
    });

    it('signs out of the relay session', async () => {
        const { result } = renderHook(() => useSessionLogout(), { wrapper });

        await act(() => result.current({ preserveUrl: true }));

        expect(logout).toHaveBeenCalledWith({ preserveUrl: true });
    });

    it('leaves the active cloud', async () => {
        const { result } = renderHook(() => useLogoutCloudSession(), { wrapper });

        await act(() => result.current.logoutCloudSession());

        expect(logoutCloud).toHaveBeenCalledTimes(1);
    });
});
