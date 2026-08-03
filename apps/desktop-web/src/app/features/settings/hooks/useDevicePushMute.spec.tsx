import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

const updateRemotePushMute = vi.fn();

// The hook's only collaborator is the device repository; faking the runtime lets the
// test drive what the server "answered" without standing up a socket.
vi.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => ({ device: { updateRemotePushMute } }),
}));

import { useNotificationPrefsStore } from '../../../shared/stores';
import { useDevicePushMute } from './useDevicePushMute';

const wrapper = ({ children }: { children: ReactNode }) => {
    // Retries would make a rejected write take several seconds to surface as an error.
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useDevicePushMute', () => {
    beforeEach(() => {
        updateRemotePushMute.mockReset();
        useNotificationPrefsStore.setState({ pushMuted: false });
        window.CHATIC_APP_PLATFORM = 'desktop';
    });

    it('is unsupported outside the shell, where no device is registered to address', () => {
        delete window.CHATIC_APP_PLATFORM;
        const { result } = renderHook(() => useDevicePushMute(), { wrapper });

        expect(result.current.isSupported).toBe(false);
    });

    it('flips before the request lands, so the switch does not lag the click', async () => {
        let resolve: (value: boolean) => void = () => undefined;
        updateRemotePushMute.mockReturnValue(new Promise<boolean>(r => (resolve = r)));

        const { result } = renderHook(() => useDevicePushMute(), { wrapper });
        act(() => result.current.setPushEnabled(false));

        // The flip lands in the same tick as the click; TanStack Query starts the
        // mutation a tick later, which is exactly what makes this optimistic.
        expect(result.current.pushEnabled).toBe(false);
        await waitFor(() => expect(updateRemotePushMute).toHaveBeenCalledWith(true));
        await act(async () => resolve(true));
    });

    // The write doubles as the read: what the server echoes wins over what we sent.
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
