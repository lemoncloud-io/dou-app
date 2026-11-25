import { useSyncExternalStore, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

import { resetHostProfileForTests } from '@chatic/bridges';

const updateRemotePushMute = vi.fn();

let mutedState = false;
const listeners = new Set<() => void>();
const setPushMutedMock = vi.fn((value: boolean) => {
    mutedState = value;
    listeners.forEach(listener => listener());
});

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({ device: { updateRemotePushMute } }),
        },
        settings: {
            set: (_key: string, value: boolean) => setPushMutedMock(value),
            useConfigValue: () =>
                useSyncExternalStore(
                    listener => {
                        listeners.add(listener);
                        return () => listeners.delete(listener);
                    },
                    () => mutedState
                ),
        },
    })
);

import { useDevicePushMute } from './useDevicePushMute';

const wrapper = ({ children }: { children: ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useDevicePushMute', () => {
    beforeEach(() => {
        updateRemotePushMute.mockReset();
        setPushMutedMock.mockClear();
        mutedState = false;
        listeners.clear();
        window.CHATIC_APP_PLATFORM = 'desktop';
        resetHostProfileForTests();
    });

    it('is unsupported outside the shell, where no device is registered to address', () => {
        delete window.CHATIC_APP_PLATFORM;
        const { result } = renderHook(() => useDevicePushMute(), { wrapper });

        expect(result.current.isSupported).toBe(false);
    });

    it('is supported inside the shell, which injected its platform', () => {
        const { result } = renderHook(() => useDevicePushMute(), { wrapper });

        expect(result.current.isSupported).toBe(true);
    });

    it('flips before the request lands, so the switch does not lag the click', async () => {
        let resolve: (value: boolean) => void = () => undefined;
        updateRemotePushMute.mockReturnValue(new Promise<boolean>(r => (resolve = r)));

        const { result } = renderHook(() => useDevicePushMute(), { wrapper });
        act(() => result.current.setPushEnabled(false));

        expect(result.current.pushEnabled).toBe(false);
        await waitFor(() => expect(updateRemotePushMute).toHaveBeenCalledWith(true));
        await act(async () => resolve(true));
    });

    it('reconciles to the server echo rather than the value it sent', async () => {
        updateRemotePushMute.mockResolvedValue(false);

        const { result } = renderHook(() => useDevicePushMute(), { wrapper });
        await act(async () => result.current.setPushEnabled(false));

        await waitFor(() => expect(result.current.pushEnabled).toBe(true));
        expect(result.current.hasFailed).toBe(false);
    });

    it('rolls back and reports failure when the write is rejected', async () => {
        updateRemotePushMute.mockRejectedValue(new Error('offline'));

        const { result } = renderHook(() => useDevicePushMute(), { wrapper });
        await act(async () => result.current.setPushEnabled(false));

        await waitFor(() => expect(result.current.hasFailed).toBe(true));
        expect(result.current.pushEnabled).toBe(true);
    });

    it('clears a previous failure when the user tries again', async () => {
        updateRemotePushMute.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(true);

        const { result } = renderHook(() => useDevicePushMute(), { wrapper });
        await act(async () => result.current.setPushEnabled(false));
        await waitFor(() => expect(result.current.hasFailed).toBe(true));

        await act(async () => result.current.setPushEnabled(false));
        await waitFor(() => expect(result.current.hasFailed).toBe(false));
        expect(result.current.pushEnabled).toBe(false);
    });
});
